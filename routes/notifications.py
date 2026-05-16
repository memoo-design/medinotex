"""
Notifications Routes
GET  /api/notifications/          – list all notifications
POST /api/notifications/<id>/read – mark single as read
POST /api/notifications/read-all  – mark all as read
DELETE /api/notifications/<id>    – delete one notification
"""
from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from extensions import db
from models.clinical import Notification

notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.get("/")
@login_required
def list_notifications():
    notifs = (
        Notification.query
        .filter_by(doctor_id=current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    unread = sum(1 for n in notifs if not n.is_read)
    return jsonify({"notifications": [n.to_dict() for n in notifs], "unread": unread}), 200


@notifications_bp.post("/<int:notif_id>/read")
@login_required
def mark_read(notif_id):
    n = Notification.query.filter_by(id=notif_id, doctor_id=current_user.id).first()
    if not n:
        return jsonify({"error": "Not found"}), 404
    n.is_read = True
    db.session.commit()
    return jsonify({"message": "Marked as read"}), 200


@notifications_bp.post("/read-all")
@login_required
def mark_all_read():
    Notification.query.filter_by(doctor_id=current_user.id, is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"message": "All notifications marked as read"}), 200


@notifications_bp.delete("/<int:notif_id>")
@login_required
def delete_notification(notif_id):
    n = Notification.query.filter_by(id=notif_id, doctor_id=current_user.id).first()
    if not n:
        return jsonify({"error": "Not found"}), 404
    db.session.delete(n)
    db.session.commit()
    return jsonify({"message": "Notification deleted"}), 200
