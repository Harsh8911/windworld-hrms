const { pool } = require("../db/pool");
const { AppError } = require("../errors/AppError");

function publicNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    isRead: row.read_at !== null,
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function listEmployeeNotifications(employeeUserId) {
  const [notifications, count] = await Promise.all([
    pool.query(
      `SELECT id, type, title, message, read_at, created_at
       FROM employee_notifications
       WHERE employee_user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [employeeUserId],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS unread_count
       FROM employee_notifications
       WHERE employee_user_id = $1 AND read_at IS NULL`,
      [employeeUserId],
    ),
  ]);

  return {
    notifications: notifications.rows.map(publicNotification),
    unreadCount: count.rows[0].unread_count,
  };
}

async function markEmployeeNotificationRead(employeeUserId, notificationId) {
  const result = await pool.query(
    `UPDATE employee_notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND employee_user_id = $2
     RETURNING id, type, title, message, read_at, created_at`,
    [notificationId, employeeUserId],
  );
  if (result.rowCount === 0) {
    throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
  }
  return publicNotification(result.rows[0]);
}

module.exports = { listEmployeeNotifications, markEmployeeNotificationRead };
