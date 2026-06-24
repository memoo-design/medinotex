"""Route decorators for role-based access control."""
from functools import wraps
from flask import jsonify
from flask_login import current_user


def role_required(*roles):
    """Restrict a route to users whose role is in *roles."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({"error": "Authentication required"}), 401
            if current_user.role not in roles:
                return jsonify({"error": "Insufficient permissions"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator
