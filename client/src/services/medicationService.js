import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  getDoc,
  Timestamp,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../config/firebase';

if (!db) {
  console.error('Firestore is not initialized. Please configure your .env file.');
}

const MEDICATIONS_COLLECTION = 'medications';
const MEDICATION_LOGS_COLLECTION = 'medicationLogs';

const withTimeout = (promise, timeoutMs = 10000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timed out. Please check your internet connection.')), timeoutMs)
    )
  ]);
};

const testFirestoreConnection = async () => {
  try {
    if (!db) {
      return { connected: false, error: 'Firestore not initialized' };
    }
    
    const testQuery = query(collection(db, MEDICATIONS_COLLECTION), limit(1));
    await Promise.race([
      getDocs(testQuery),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Connection test timeout')), 3000))
    ]);
    return { connected: true, error: null };
  } catch (error) {
    if (error.message && error.message.includes('permission')) {
      return { connected: true, error: 'Permission denied (rules issue)' };
    }
    return { connected: false, error: error.message };
  }
};

export const addMedication = async (userId, medicationData) => {
  try {
    if (!db) {
      return { 
        id: null, 
        error: 'Firestore is not initialized. Please check your Firebase configuration in firebase.js and ensure your .env file is set up correctly.' 
      };
    }

    if (!userId) {
      return { id: null, error: 'User ID is required' };
    }

    console.log('Testing Firestore connection...');
    const connectionTest = await testFirestoreConnection();
    if (!connectionTest.connected) {
      console.warn('⚠️ Firestore connection test failed:', connectionTest.error);
      
      if (connectionTest.error && connectionTest.error.includes('timeout')) {
        console.error('❌ Firestore appears to be disabled or not responding.');
        console.error('📖 See ENABLE_FIRESTORE.md for step-by-step instructions to enable Firestore.');
        console.error('💡 You can also run window.testFirestore() in the browser console for detailed diagnostics.');
      }
    } else {
      console.log('✅ Firestore connection test passed');
    }

    const medication = {
      ...medicationData,
      userId,
      createdAt: Timestamp.now(),
      isActive: true
    };

    console.log('Adding medication to Firestore:', { userId, medicationData: medication });
    
    const startTime = Date.now();
    const docRef = await withTimeout(
      addDoc(collection(db, MEDICATIONS_COLLECTION), medication),
      8000
    );
    const duration = Date.now() - startTime;
    console.log(`Medication added successfully with ID: ${docRef.id} (took ${duration}ms)`);
    
    return { id: docRef.id, error: null };
  } catch (error) {
    console.error('Error in addMedication:', error);
    const errorMessage = error.message || 'Failed to add medication';
    
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return { 
        id: null, 
        error: '❌ Request timed out. This usually means:\n\n' +
          '1. 🔴 Firestore is NOT enabled in Firebase Console\n' +
          '   → Go to Firebase Console > Firestore Database > Create database\n' +
          '   → See ENABLE_FIRESTORE.md for detailed steps\n\n' +
          '2. 🔴 Security rules are blocking all access\n' +
          '   → Update rules in Firebase Console > Firestore Database > Rules\n' +
          '   → See FIREBASE_SECURITY_RULES.md for correct rules\n\n' +
          '3. ⚠️ Network/firewall blocking Firestore\n' +
          '   → Check internet connection\n' +
          '   → Try in incognito mode\n\n' +
          '💡 Run window.testFirestore() in browser console for detailed diagnostics.'
      };
    }
    if (errorMessage.includes('permission') || errorMessage.includes('Permission')) {
      return { 
        id: null, 
        error: 'Permission denied. Please update your Firestore security rules to allow writes. See FIREBASE_SECURITY_RULES.md for help.' 
      };
    }
    if (errorMessage.includes('network') || errorMessage.includes('Network')) {
      return { id: null, error: 'Network error. Please check your internet connection.' };
    }
    if (errorMessage.includes('unavailable') || errorMessage.includes('unavailable')) {
      return { id: null, error: 'Firestore service is unavailable. Please try again later.' };
    }
    
    return { id: null, error: errorMessage };
  }
};

export const getMedications = async (userId) => {
  try {
    if (!db) {
      return { medications: [], error: 'Firestore is not initialized' };
    }
    
    if (!userId) {
      return { medications: [], error: 'User ID is required' };
    }
    
    console.log('Fetching medications for userId:', userId);
    
    let querySnapshot;
    try {
      const q = query(
        collection(db, MEDICATIONS_COLLECTION),
        where('userId', '==', userId),
        where('isActive', '==', true),
        orderBy('createdAt', 'desc')
      );
      querySnapshot = await withTimeout(getDocs(q), 8000);
    } catch (orderByError) {
      console.warn('orderBy failed, trying without it:', orderByError.message);
      const q = query(
        collection(db, MEDICATIONS_COLLECTION),
        where('userId', '==', userId),
        where('isActive', '==', true)
      );
      querySnapshot = await withTimeout(getDocs(q), 8000);
    }
    
    const medications = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      medications.push({ 
        id: doc.id, 
        ...data,
        timeSlots: Array.isArray(data.timeSlots) ? data.timeSlots : (data.timeSlots ? [data.timeSlots] : ['Morning'])
      });
    });
    
    medications.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0;
      const bTime = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0;
      return bTime - aTime;
    });
    
    console.log(`Found ${medications.length} medications:`, medications.map(m => ({ id: m.id, name: m.name, timeSlots: m.timeSlots })));
    return { medications, error: null };
  } catch (error) {
    console.error('Error in getMedications:', error);
    return { medications: [], error: error.message || 'Failed to fetch medications' };
  }
};

export const getMedication = async (medicationId) => {
  try {
    const docRef = doc(db, MEDICATIONS_COLLECTION, medicationId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { medication: { id: docSnap.id, ...docSnap.data() }, error: null };
    }
    return { medication: null, error: 'Medication not found' };
  } catch (error) {
    return { medication: null, error: error.message };
  }
};

export const updateMedication = async (medicationId, updates) => {
  try {
    const docRef = doc(db, MEDICATIONS_COLLECTION, medicationId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: Timestamp.now()
    });
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
};

export const deleteMedication = async (medicationId) => {
  try {
    const docRef = doc(db, MEDICATIONS_COLLECTION, medicationId);
    await updateDoc(docRef, { isActive: false });
    return { error: null };
  } catch (error) {
    return { error: error.message };
  }
};

export const unmarkMedicationAsTaken = async (userId, medicationId, timeSlot) => {
  try {
    if (!db) {
      return { error: 'Firestore is not initialized' };
    }

    if (!userId || !medicationId || !timeSlot) {
      return { error: 'Missing required parameters: userId, medicationId, or timeSlot' };
    }

    console.log('🔄 Unmarking medication:', { userId, medicationId, timeSlot });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);

    const q = query(
      collection(db, MEDICATION_LOGS_COLLECTION),
      where('userId', '==', userId),
      where('medicationId', '==', medicationId),
      where('date', '==', todayTimestamp),
      where('timeSlot', '==', timeSlot)
    );
    
    const existingLogs = await withTimeout(getDocs(q), 8000);

    if (!existingLogs.empty) {
      const logDoc = existingLogs.docs[0];
      console.log('🗑️ Deleting medication log:', logDoc.id);
      
      await withTimeout(
        deleteDoc(doc(db, MEDICATION_LOGS_COLLECTION, logDoc.id)),
        8000
      );
      
      console.log('✅ Medication log deleted successfully');
      return { error: null };
    } else {
      console.log('⚠️ No log entry found to delete');
      return { error: 'No medication log found to unmark' };
    }
  } catch (error) {
    console.error('❌ Error in unmarkMedicationAsTaken:', error);
    const errorMessage = error.message || 'Failed to unmark medication';
    
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return { error: 'Request timed out. Please check your internet connection and try again.' };
    }
    if (errorMessage.includes('permission') || errorMessage.includes('Permission')) {
      return { error: 'Permission denied. Please check your Firestore security rules.' };
    }
    
    return { error: errorMessage };
  }
};

export const markMedicationAsTaken = async (userId, medicationId, timeSlot, proofPhotoUrl = null, markedBy = 'patient') => {
  try {
    if (!db) {
      return { id: null, error: 'Firestore is not initialized' };
    }

    if (!userId || !medicationId || !timeSlot) {
      return { id: null, error: 'Missing required parameters: userId, medicationId, or timeSlot' };
    }

    console.log('📝 Marking medication as taken:', { userId, medicationId, timeSlot, markedBy });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);

    const q = query(
      collection(db, MEDICATION_LOGS_COLLECTION),
      where('userId', '==', userId),
      where('medicationId', '==', medicationId),
      where('date', '==', todayTimestamp),
      where('timeSlot', '==', timeSlot)
    );
    
    console.log('🔍 Checking for existing log...');
    const existingLogs = await withTimeout(getDocs(q), 8000);

    if (!existingLogs.empty) {
      const logDoc = existingLogs.docs[0];
      console.log('📝 Updating existing log:', logDoc.id);
      
      await withTimeout(
        updateDoc(doc(db, MEDICATION_LOGS_COLLECTION, logDoc.id), {
          status: 'taken',
          takenAt: Timestamp.now(),
          proofPhotoUrl,
          markedBy,
          updatedAt: Timestamp.now()
        }),
        8000
      );
      
      console.log('✅ Update completed, verifying...');
      const verifyDoc = await getDoc(doc(db, MEDICATION_LOGS_COLLECTION, logDoc.id));
      if (verifyDoc.exists() && verifyDoc.data().status === 'taken') {
        console.log('✅ Verification successful - medication marked as taken');
        return { id: logDoc.id, error: null };
      } else {
        console.error('❌ Verification failed - status not updated correctly');
        return { id: logDoc.id, error: 'Failed to verify medication was marked as taken' };
      }
    } else {
      console.log('📝 Creating new log entry...');
      const logData = {
        userId,
        medicationId,
        date: todayTimestamp,
        timeSlot,
        status: 'taken',
        takenAt: Timestamp.now(),
        proofPhotoUrl,
        markedBy,
        createdAt: Timestamp.now()
      };
      
      const docRef = await withTimeout(
        addDoc(collection(db, MEDICATION_LOGS_COLLECTION), logData),
        8000
      );
      
      console.log('✅ New log created with ID:', docRef.id);
      
      console.log('✅ Creation completed, verifying...');
      const verifyDoc = await getDoc(doc(db, MEDICATION_LOGS_COLLECTION, docRef.id));
      if (verifyDoc.exists() && verifyDoc.data().status === 'taken') {
        console.log('✅ Verification successful - medication marked as taken');
        return { id: docRef.id, error: null };
      } else {
        console.error('❌ Verification failed - log not created correctly');
        return { id: docRef.id, error: 'Failed to verify medication was marked as taken' };
      }
    }
  } catch (error) {
    console.error('❌ Error in markMedicationAsTaken:', error);
    const errorMessage = error.message || 'Failed to mark medication as taken';
    
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return { id: null, error: 'Request timed out. Please check your internet connection and try again.' };
    }
    if (errorMessage.includes('permission') || errorMessage.includes('Permission')) {
      return { id: null, error: 'Permission denied. Please check your Firestore security rules.' };
    }
    
    return { id: null, error: errorMessage };
  }
};

export const getMedicationLogs = async (userId, startDate, endDate, limitCount = null) => {
  try {
    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    let querySnapshot;
    let logs = [];
    
    try {
      let q = query(
        collection(db, MEDICATION_LOGS_COLLECTION),
        where('userId', '==', userId),
        where('date', '>=', startTimestamp),
        where('date', '<=', endTimestamp),
        orderBy('date', 'desc')
      );
      
      if (limitCount) {
        q = query(q, limit(limitCount));
      }
      
      querySnapshot = await getDocs(q);
      querySnapshot.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() });
      });
    } catch (orderByError) {
      console.log('ℹ️ orderBy requires index. Trying query without orderBy...');
      try {
        let q = query(
          collection(db, MEDICATION_LOGS_COLLECTION),
          where('userId', '==', userId),
          where('date', '>=', startTimestamp),
          where('date', '<=', endTimestamp)
        );
        
        if (limitCount) {
          q = query(q, limit(limitCount));
        }
        
        querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
          logs.push({ id: doc.id, ...doc.data() });
        });
      } catch (dateRangeError) {
        console.log('ℹ️ Date range query requires index. Using fallback: querying all logs and filtering in memory.');
        try {
          let q = query(
            collection(db, MEDICATION_LOGS_COLLECTION),
            where('userId', '==', userId)
          );
          
          const queryLimit = limitCount ? (limitCount > 100 ? limitCount * 2 : 200) : null;
          if (queryLimit) {
            q = query(q, limit(queryLimit));
          }
          
          querySnapshot = await getDocs(q);
          
          querySnapshot.forEach((doc) => {
            const logData = { id: doc.id, ...doc.data() };
            const logDate = logData.date;
            
            if (logDate) {
              let logTimestamp;
              if (logDate.toMillis) {
                logTimestamp = logDate.toMillis();
              } else if (logDate.seconds) {
                logTimestamp = logDate.seconds * 1000;
              } else if (logDate instanceof Date) {
                logTimestamp = logDate.getTime();
              } else {
                return;
              }
              
              const startTime = startTimestamp.toMillis();
              const endTime = endTimestamp.toMillis();
              
              if (logTimestamp >= startTime && logTimestamp <= endTime) {
                logs.push(logData);
              }
            }
          });
          
          console.log(`✅ Filtered ${logs.length} logs from ${querySnapshot.size} total logs for date range`);
        } catch (simpleQueryError) {
          console.error('❌ Even simple query failed:', simpleQueryError);
          throw simpleQueryError;
        }
      }
    }
    
    logs.sort((a, b) => {
      const aTime = a.date?.toMillis?.() || a.date?.seconds * 1000 || 0;
      const bTime = b.date?.toMillis?.() || b.date?.seconds * 1000 || 0;
      return bTime - aTime;
    });
    
    if (limitCount && logs.length > limitCount) {
      logs = logs.slice(0, limitCount);
    }
    
    return { logs, error: null };
  } catch (error) {
    console.error('Error in getMedicationLogs:', error);
    return { logs: [], error: error.message };
  }
};

export const getTodayMedicationStatus = async (userId, medications = null) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);
    
    console.log('📅 Getting today status for date:', today.toISOString(), 'timestamp:', todayTimestamp.toDate().toISOString());

    let meds = medications;
    if (!meds) {
      const result = await getMedications(userId);
      meds = result.medications;
    }

    console.log('💊 Processing', meds.length, 'medications');

    const { logs, error: logsError } = await getMedicationLogs(userId, today, today);
    
    if (logsError) {
      console.error('❌ Error getting logs:', logsError);
    }
    
    console.log('📋 Found', logs.length, 'logs for today');
    console.log('📋 Log details:', logs.map(log => ({
      id: log.id,
      medicationId: log.medicationId,
      timeSlot: log.timeSlot,
      status: log.status,
      markedBy: log.markedBy,
      date: log.date?.toDate ? log.date.toDate().toISOString() : 'N/A'
    })));

    const logMap = {};
    logs.forEach(log => {
      const key = `${log.medicationId}_${log.timeSlot || 'default'}`;
      console.log('🗺️ Mapping log:', key, 'status:', log.status);
      if (!logMap[key] || log.status === 'taken') {
        logMap[key] = log;
      }
    });

    console.log('🗺️ Log map keys:', Object.keys(logMap));

    const todayStatus = [];
    meds.forEach(med => {
      const timeSlots = med.timeSlots || ['Morning'];
      
      timeSlots.forEach(timeSlot => {
        const key = `${med.id}_${timeSlot}`;
        const log = logMap[key];
        
        console.log(`🔍 Checking ${med.name} (${timeSlot}): key="${key}", log found:`, !!log, 'status:', log?.status || 'pending');
        
        todayStatus.push({
          medication: med,
          timeSlot,
          status: log?.status || 'pending',
          logId: log?.id,
          takenAt: log?.takenAt,
          proofPhotoUrl: log?.proofPhotoUrl,
          markedBy: log?.markedBy
        });
      });
    });

    console.log('✅ Today status result:', todayStatus.map(item => ({
      medication: item.medication.name,
      timeSlot: item.timeSlot,
      status: item.status,
      logId: item.logId,
      markedBy: item.markedBy,
      proofPhotoUrl: item.proofPhotoUrl ? 'YES' : 'NO'
    })));

    return { todayStatus, error: null };
  } catch (error) {
    console.error('❌ Error in getTodayMedicationStatus:', error);
    return { todayStatus: [], error: error.message };
  }
};

export const checkMedicationReminders = async (userId, todayStatus = null) => {
  try {
    let status = todayStatus;
    if (!status) {
      const result = await getTodayMedicationStatus(userId);
      status = result.todayStatus;
    }
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinutes;
    
    const timeSlotDeadlines = {
      'Morning': 9 * 60,
      'Afternoon': 13 * 60 + 30,
      'Evening': 17 * 60,
      'Night': 21 * 60
    };

    const reminders = [];
    
    status.forEach(item => {
      if (item.status === 'pending') {
        const deadline = timeSlotDeadlines[item.timeSlot];
        if (deadline !== undefined) {
          if (currentTime >= deadline) {
            reminders.push({
              medication: item.medication,
              timeSlot: item.timeSlot,
              needsReminder: true,
              deadline: deadline
            });
          }
        }
      }
    });

    return { reminders, error: null };
  } catch (error) {
    return { reminders: [], error: error.message };
  }
};

export const checkMissedMedicationsForCaretaker = async (userId, todayStatus = null) => {
  try {
    let status = todayStatus;
    if (!status) {
      const result = await getTodayMedicationStatus(userId);
      status = result.todayStatus;
    }
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinutes;
    
    const timeSlotDeadlines = {
      'Morning': 9 * 60,
      'Afternoon': 13 * 60 + 30,
      'Evening': 17 * 60,
      'Night': 21 * 60
    };

    const missedMedications = [];
    
    status.forEach(item => {
      if (item.status === 'pending') {
        const deadline = timeSlotDeadlines[item.timeSlot];
        if (deadline !== undefined) {
          if (currentTime >= deadline) {
            missedMedications.push({
              medication: item.medication,
              timeSlot: item.timeSlot,
              deadline: deadline
            });
          }
        }
      }
    });

    return { missedMedications, error: null };
  } catch (error) {
    return { missedMedications: [], error: error.message };
  }
};

export const getAdherenceStats = async (userId, month, year, medications = null) => {
  try {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    let meds = medications;
    if (!meds) {
      const result = await getMedications(userId);
      meds = result.medications;
    }
    
    const { logs } = await getMedicationLogs(userId, startDate, endDate, 500);

    const totalDays = endDate.getDate();
    const takenCount = logs.filter(log => log.status === 'taken').length;
    const missedCount = logs.filter(log => log.status === 'missed').length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentLogs = logs
      .filter(log => {
        const logDate = log.date.toDate();
        logDate.setHours(0, 0, 0, 0);
        return logDate >= thirtyDaysAgo && log.status === 'taken';
      })
      .sort((a, b) => b.date.toMillis() - a.date.toMillis());

    let streak = 0;
    for (let i = 0; i < recentLogs.length; i++) {
      const logDate = recentLogs[i].date.toDate();
      logDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((today - logDate) / (1000 * 60 * 60 * 24));
      if (daysDiff === i) {
        streak++;
      } else {
        break;
      }
    }

    const adherenceRate = meds.length > 0
      ? Math.round((takenCount / (meds.length * totalDays)) * 100)
      : 0;

    return {
      stats: {
        adherenceRate,
        streak,
        takenCount,
        missedCount,
        totalDays
      },
      error: null
    };
  } catch (error) {
    return { stats: null, error: error.message };
  }
};

export const subscribeToTodayMedicationLogs = (userId, callback) => {
  if (!db) {
    console.error('Firestore is not initialized');
    return () => {};
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowTimestamp = Timestamp.fromDate(tomorrow);

    const q = query(
      collection(db, MEDICATION_LOGS_COLLECTION),
      where('userId', '==', userId)
    );

    console.log('👂 Setting up real-time listener for medication logs (with in-memory date filtering)...');
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const logs = [];
        snapshot.forEach((doc) => {
          const logData = { id: doc.id, ...doc.data() };
          
          const logDate = logData.date;
          if (logDate) {
            let logTimestamp;
            if (logDate.toMillis) {
              logTimestamp = logDate.toMillis();
            } else if (logDate.seconds) {
              logTimestamp = logDate.seconds * 1000;
            } else {
              return;
            }
            
            const startTime = todayTimestamp.toMillis();
            const endTime = tomorrowTimestamp.toMillis();
            
            if (logTimestamp >= startTime && logTimestamp < endTime) {
              logs.push(logData);
            }
          }
        });
        
        console.log('🔄 Real-time update: Medication logs changed. Count:', logs.length, '(filtered from', snapshot.size, 'total logs)');
        if (logs.length > 0) {
          console.log('📋 Today\'s logs:', logs.map(log => ({
            medicationId: log.medicationId,
            timeSlot: log.timeSlot,
            status: log.status,
            markedBy: log.markedBy
          })));
        }
        
        callback({ logs, error: null });
      },
      (error) => {
        console.error('❌ Real-time listener error:', error);
        callback({ logs: [], error: error.message });
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('❌ Error setting up real-time listener:', error);
    return () => {};
  }
};

