"""
Azure Document Intelligence (Form Recognizer)
Extracts structured text from scanned PDFs, prescriptions, handwritten notes.
"""
import logging
from flask import current_app

logger = logging.getLogger(__name__)


def extract_text_from_document(file_stream=None, blob_url: str = None) -> str:
    """
    Extract text from a document using Azure Document Intelligence.

    Provide either:
    - file_stream: a file-like object (bytes / BytesIO)
    - blob_url:    a public or SAS URL to a blob already uploaded to Azure

    Returns the extracted plain text string.
    """
    endpoint = current_app.config.get("AZURE_FORM_RECOGNIZER_ENDPOINT", "")
    key      = current_app.config.get("AZURE_FORM_RECOGNIZER_KEY",      "")

    if not endpoint or not key:
        logger.warning("Azure Form Recognizer credentials missing – falling back to local extraction.")
        return _local_fallback_extract(file_stream)

    try:
        from azure.ai.formrecognizer import DocumentAnalysisClient
        from azure.core.credentials  import AzureKeyCredential

        client = DocumentAnalysisClient(endpoint=endpoint, credential=AzureKeyCredential(key))

        if blob_url:
            poller = client.begin_analyze_document_from_url("prebuilt-read", blob_url)
        elif file_stream:
            file_stream.seek(0)
            poller = client.begin_analyze_document("prebuilt-read", file_stream)
        else:
            raise ValueError("Either file_stream or blob_url must be provided.")

        result = poller.result()
        lines  = []
        for page in result.pages:
            for line in page.lines:
                lines.append(line.content)

        extracted = "\n".join(lines)
        logger.info(f"OCR extracted {len(extracted)} characters.")
        return extracted

    except Exception as e:
        logger.error(f"Document Intelligence error: {e}")
        return _local_fallback_extract(file_stream)


# ── Local fallback (no Azure) ─────────────────────────────────────────────────

def _local_fallback_extract(file_stream) -> str:
    """
    Attempt basic text extraction using PyPDF2 (PDF) or python-docx (DOCX).
    Used in development when Azure is not configured.
    """
    if file_stream is None:
        return ""

    file_stream.seek(0)
    header = file_stream.read(5)
    file_stream.seek(0)

    # PDF
    if header.startswith(b"%PDF"):
        return _extract_pdf(file_stream)

    # DOCX (ZIP magic bytes PK)
    if header[:2] == b"PK":
        return _extract_docx(file_stream)

    # Plain text
    try:
        return file_stream.read().decode("utf-8", errors="ignore")
    except Exception:
        return ""


def _extract_pdf(stream) -> str:
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(stream)
        text   = "\n".join(page.extract_text() or "" for page in reader.pages)
        return text.strip()
    except ImportError:
        logger.warning("PyPDF2 not installed. Install with: pip install PyPDF2")
        return "[PDF text extraction not available – install PyPDF2 or configure Azure Document Intelligence]"
    except Exception as e:
        logger.error(f"PDF extraction error: {e}")
        return ""


def _extract_docx(stream) -> str:
    try:
        from docx import Document
        import io
        doc  = Document(io.BytesIO(stream.read()))
        text = "\n".join(p.text for p in doc.paragraphs)
        return text.strip()
    except ImportError:
        logger.warning("python-docx not installed. Install with: pip install python-docx")
        return "[DOCX text extraction not available – install python-docx or configure Azure Document Intelligence]"
    except Exception as e:
        logger.error(f"DOCX extraction error: {e}")
        return ""
