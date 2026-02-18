import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../config/firebase';

const NOTIFICATIONS_COLLECTION = 'notifications';

// This will call a Cloud Function to send email notifications
export const sendMissedMedicationEmail = async (userId, medicationName, timeSlot = null) => {
  try {
    if (!functions) {
      console.warn('Firebase Functions not initialized. Email notification skipped.');
      return { success: false, error: 'Functions not initialized' };
    }

    const sendEmail = httpsCallable(functions, 'sendMissedMedicationEmail');
    const result = await sendEmail({
      userId,
      medicationName,
      timeSlot,
      timestamp: new Date().toISOString()
    });

    // Also save notification to Firestore
    if (result.data?.success) {
      await saveNotificationToFirestore(userId, medicationName, timeSlot);
    }

    return { success: true, error: null };
  } catch (error) {
    console.error('Error sending email:', error);
    // Still try to save notification even if email fails
    try {
      await saveNotificationToFirestore(userId, medicationName, timeSlot);
    } catch (saveError) {
      console.error('Error saving notification:', saveError);
    }
    return { success: false, error: error.message };
  }
};

// Save notification to Firestore
const saveNotificationToFirestore = async (userId, medicationName, timeSlot = null) => {
  try {
    if (!db) {
      console.warn('Firestore not initialized. Notification not saved.');
      return { error: 'Firestore not initialized' };
    }

    const notification = {
      userId,
      type: 'missed_medication',
      medicationName,
      timeSlot,
      message: `Patient didn't take ${medicationName}${timeSlot ? ` (${timeSlot})` : ''}`,
      read: false,
      createdAt: Timestamp.now(),
      date: Timestamp.fromDate(new Date(new Date().setHours(0, 0, 0, 0))) // Today's date at midnight
    };

    await addDoc(collection(db, NOTIFICATIONS_COLLECTION), notification);
    console.log('✅ Notification saved to Firestore:', notification);
    return { error: null };
  } catch (error) {
    console.error('Error saving notification to Firestore:', error);
    return { error: error.message };
  }
};

// Get notifications for a user
export const getNotifications = async (userId, limitCount = 50) => {
  try {
    if (!db) {
      return { notifications: [], error: 'Firestore not initialized' };
    }

    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    const notifications = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return { notifications, error: null };
  } catch (error) {
    console.error('Error getting notifications:', error);
    // Fallback: try without orderBy if index is missing
    try {
      const q = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('userId', '==', userId),
        limit(limitCount)
      );
      const querySnapshot = await getDocs(q);
      const notifications = querySnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .sort((a, b) => {
          const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return bTime - aTime; // Descending order
        });

      return { notifications, error: null };
    } catch (fallbackError) {
      return { notifications: [], error: fallbackError.message };
    }
  }
};

// Get unread notification count
export const getUnreadNotificationCount = async (userId) => {
  try {
    if (!db) {
      return { count: 0, error: 'Firestore not initialized' };
    }

    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('userId', '==', userId),
      where('read', '==', false)
    );

    const querySnapshot = await getDocs(q);
    return { count: querySnapshot.size, error: null };
  } catch (error) {
    console.error('Error getting unread count:', error);
    return { count: 0, error: error.message };
  }
};

// Mark notification as read
export const markNotificationAsRead = async (notificationId) => {
  try {
    if (!db) {
      return { error: 'Firestore not initialized' };
    }

    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, NOTIFICATIONS_COLLECTION, notificationId), {
      read: true,
      readAt: Timestamp.now()
    });

    return { error: null };
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return { error: error.message };
  }
};

// Mark all notifications as read
export const markAllNotificationsAsRead = async (userId) => {
  try {
    if (!db) {
      return { error: 'Firestore not initialized' };
    }

    const { getDocs, query, where, updateDoc, doc } = await import('firebase/firestore');
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('userId', '==', userId),
      where('read', '==', false)
    );

    const querySnapshot = await getDocs(q);
    const updatePromises = querySnapshot.docs.map(docRef =>
      updateDoc(doc(db, NOTIFICATIONS_COLLECTION, docRef.id), {
        read: true,
        readAt: Timestamp.now()
      })
    );

    await Promise.all(updatePromises);
    return { error: null };
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return { error: error.message };
  }
};

// Subscribe to real-time notifications
export const subscribeToNotifications = (userId, callback) => {
  if (!db) {
    console.warn('Firestore not initialized. Cannot subscribe to notifications.');
    return () => {};
  }

  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notifications = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        callback({ notifications, error: null });
      },
      (error) => {
        console.error('Error in notification subscription:', error);
        // Fallback: try without orderBy
        try {
          const fallbackQ = query(
            collection(db, NOTIFICATIONS_COLLECTION),
            where('userId', '==', userId),
            limit(50)
          );
          const fallbackUnsubscribe = onSnapshot(
            fallbackQ,
            (snapshot) => {
              const notifications = snapshot.docs
                .map(doc => ({
                  id: doc.id,
                  ...doc.data()
                }))
                .sort((a, b) => {
                  const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                  const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                  return bTime - aTime;
                });
              callback({ notifications, error: null });
            },
            (fallbackError) => {
              console.error('Error in fallback notification subscription:', fallbackError);
              callback({ notifications: [], error: fallbackError.message });
            }
          );
          return fallbackUnsubscribe;
        } catch (fallbackError) {
          callback({ notifications: [], error: fallbackError.message });
          return () => {};
        }
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('Error setting up notification subscription:', error);
    callback({ notifications: [], error: error.message });
    return () => {};
  }
};

// Check for missed medications and send notifications
export const checkMissedMedications = async (userId, medications, scheduledTime) => {
  try {
    const now = new Date();
    const scheduled = new Date(scheduledTime);
    const timeDiff = now - scheduled;
    const hoursDiff = timeDiff / (1000 * 60 * 60);

    // If medication is scheduled and more than 2 hours have passed without marking
    if (hoursDiff > 2) {
      for (const medication of medications) {
        // Check if medication was marked today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // This would check the medication logs
        // For now, we'll trigger the email notification
        await sendMissedMedicationEmail(userId, medication.name);
      }
    }
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
};
