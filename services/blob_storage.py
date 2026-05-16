"""
Azure Blob Storage Service
Handles file upload, download URL generation, and deletion.
"""
import uuid
import logging
from flask import current_app

logger = logging.getLogger(__name__)


def _get_client(container: str = None):
    """Return (BlobServiceClient, container_name) or raise."""
    try:
        from azure.storage.blob import BlobServiceClient
    except ImportError:
        raise RuntimeError("azure-storage-blob not installed. Run: pip install azure-storage-blob")

    conn_str  = current_app.config.get("AZURE_STORAGE_CONNECTION_STRING", "")
    container = container or current_app.config.get("AZURE_BLOB_CONTAINER", "clinical-notes")

    if not conn_str:
        raise RuntimeError("AZURE_STORAGE_CONNECTION_STRING is not set in config / .env")

    client = BlobServiceClient.from_connection_string(conn_str)
    return client, container


def upload_file_to_blob(file_stream, original_filename: str, content_type: str = "application/octet-stream") -> dict:
    """
    Upload a file-like object to Azure Blob Storage.

    Returns:
        {
          "blob_name": "unique-uuid-originalfilename",
          "blob_url":  "https://<account>.blob.core.windows.net/<container>/<blob_name>",
          "file_name": "originalfilename"
        }
    """
    client, container = _get_client()

    # Ensure container exists
    container_client = client.get_container_client(container)
    try:
        container_client.create_container()
    except Exception:
        pass  # Already exists

    # Unique blob name to prevent collisions
    ext       = original_filename.rsplit(".", 1)[-1] if "." in original_filename else ""
    blob_name = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex

    blob_client = container_client.get_blob_client(blob_name)
    blob_client.upload_blob(file_stream, overwrite=True, content_settings=_content_settings(content_type))

    blob_url = blob_client.url
    logger.info(f"Uploaded blob: {blob_name} → {blob_url}")

    return {
        "blob_name": blob_name,
        "blob_url":  blob_url,
        "file_name": original_filename,
    }


def generate_sas_url(blob_name: str, expiry_hours: int = 1) -> str:
    """
    Generate a short-lived SAS URL for secure, time-limited access to a blob.
    Use this when you want the client to download a file without making it public.
    """
    from azure.storage.blob import generate_blob_sas, BlobSasPermissions
    from datetime import datetime, timedelta, timezone

    client, container = _get_client()
    account_name = client.account_name
    account_key  = client.credential.account_key

    sas_token = generate_blob_sas(
        account_name   = account_name,
        container_name = container,
        blob_name      = blob_name,
        account_key    = account_key,
        permission     = BlobSasPermissions(read=True),
        expiry         = datetime.now(timezone.utc) + timedelta(hours=expiry_hours),
    )
    return f"https://{account_name}.blob.core.windows.net/{container}/{blob_name}?{sas_token}"


def delete_blob(blob_name: str) -> bool:
    """Delete a blob by name. Returns True on success."""
    try:
        client, container = _get_client()
        client.get_container_client(container).delete_blob(blob_name)
        logger.info(f"Deleted blob: {blob_name}")
        return True
    except Exception as e:
        logger.error(f"Failed to delete blob {blob_name}: {e}")
        return False


# ── Helpers ──────────────────────────────────────────────────────────────────
def _content_settings(content_type: str):
    from azure.storage.blob import ContentSettings
    return ContentSettings(content_type=content_type)
