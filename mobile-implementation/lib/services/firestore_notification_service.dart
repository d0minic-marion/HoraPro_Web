import 'package:cloud_firestore/cloud_firestore.dart';

/// Service for reading notifications from Firestore
/// Provides stream-based access to user notifications
class FirestoreNotificationService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// Get stream of notifications for a specific user
  /// Returns both general and private notifications
  Stream<List<NotificationModel>> getUserNotifications(String userId) {
    return _firestore
        .collection('notifications')
        .where('userId', whereIn: [userId, 'all'])
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snapshot) {
      return snapshot.docs
          .map((doc) => NotificationModel.fromFirestore(doc))
          .toList();
    });
  }

  /// Get stream of unread notification count
  Stream<int> getUnreadCount(String userId) {
    return _firestore
        .collection('notifications')
        .where('userId', whereIn: [userId, 'all'])
        .where('read', isEqualTo: false)
        .snapshots()
        .map((snapshot) => snapshot.docs.length);
  }

  /// Mark notification as read
  Future<void> markAsRead(String notificationId) async {
    try {
      await _firestore
          .collection('notifications')
          .doc(notificationId)
          .update({'read': true});
    } catch (e) {
      print('Error marking notification as read: $e');
      rethrow;
    }
  }

  /// Mark all notifications as read for a user
  Future<void> markAllAsRead(String userId) async {
    try {
      final batch = _firestore.batch();
      final notifications = await _firestore
          .collection('notifications')
          .where('userId', whereIn: [userId, 'all'])
          .where('read', isEqualTo: false)
          .get();

      for (var doc in notifications.docs) {
        batch.update(doc.reference, {'read': true});
      }

      await batch.commit();
    } catch (e) {
      print('Error marking all notifications as read: $e');
      rethrow;
    }
  }

  /// Delete notification
  Future<void> deleteNotification(String notificationId) async {
    try {
      await _firestore.collection('notifications').doc(notificationId).delete();
    } catch (e) {
      print('Error deleting notification: $e');
      rethrow;
    }
  }
}

/// Model for notification data
class NotificationModel {
  final String id;
  final String type; // 'general', 'private', 'schedule'
  final String title;
  final String message;
  final String userId; // 'all' for general, specific userId for private
  final bool read;
  final DateTime createdAt;
  final Map<String, dynamic>? data; // Additional data (scheduleId, etc.)

  NotificationModel({
    required this.id,
    required this.type,
    required this.title,
    required this.message,
    required this.userId,
    required this.read,
    required this.createdAt,
    this.data,
  });

  /// Create NotificationModel from Firestore document
  factory NotificationModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return NotificationModel(
      id: doc.id,
      type: data['type'] ?? 'general',
      title: data['title'] ?? '',
      message: data['message'] ?? '',
      userId: data['userId'] ?? 'all',
      read: data['read'] ?? false,
      createdAt: (data['createdAt'] as Timestamp).toDate(),
      data: data['data'],
    );
  }

  /// Convert to map for Firestore
  Map<String, dynamic> toMap() {
    return {
      'type': type,
      'title': title,
      'message': message,
      'userId': userId,
      'read': read,
      'createdAt': Timestamp.fromDate(createdAt),
      'data': data,
    };
  }
}
