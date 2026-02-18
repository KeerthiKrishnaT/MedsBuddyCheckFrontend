const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: functions.config().email?.user || process.env.EMAIL_USER,
    pass: functions.config().email?.pass || process.env.EMAIL_PASS
  }
});

exports.sendMissedMedicationEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { userId, medicationName, timeSlot, timestamp } = data;

  try {
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data();
    const caretakerEmail = userData.email;

    const timeSlotText = timeSlot ? ` (${timeSlot})` : '';
    const mailOptions = {
      from: functions.config().email?.user || process.env.EMAIL_USER,
      to: caretakerEmail,
      subject: `Medication Missed: ${medicationName}${timeSlotText}`,
      html: `
        <h2>Medication Reminder</h2>
        <p>This is to notify you that the medication <strong>${medicationName}</strong>${timeSlotText} was not marked as taken.</p>
        <p><strong>Time:</strong> ${new Date(timestamp).toLocaleString()}</p>
        <p>Please check with the patient to ensure they have taken their medication.</p>
        <p>You can mark this medication as taken from the Caretaker Dashboard if you have administered it.</p>
      `
    };

    await transporter.sendMail(mailOptions);

    try {
      const notification = {
        userId,
        type: 'missed_medication',
        medicationName,
        timeSlot: timeSlot || null,
        message: `Patient didn't take ${medicationName}${timeSlot ? ` (${timeSlot})` : ''}`,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        date: admin.firestore.Timestamp.fromDate(new Date(new Date().setHours(0, 0, 0, 0)))
      };

      await admin.firestore().collection('notifications').add(notification);
      console.log('✅ Notification saved to Firestore');
    } catch (notificationError) {
      console.error('Error saving notification to Firestore:', notificationError);
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending email:', error);
    throw new functions.https.HttpsError('internal', 'Failed to send email');
  }
});

exports.checkMissedMedications = functions.pubsub.schedule('every 15 minutes').onRun(async (context) => {
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

  const checkTimes = [540, 810, 1020, 1260];
  const shouldCheck = checkTimes.some(deadline => {
    const timeDiff = currentTime - deadline;
    return timeDiff >= 0 && timeDiff <= 15;
  });

  if (!shouldCheck) {
    console.log(`⏭️ Skipping check - current time ${currentHour}:${currentMinutes} is not within check window`);
    return null;
  }

  console.log(`⏰ Checking for missed medications at ${currentHour}:${currentMinutes}`);

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = admin.firestore.Timestamp.fromDate(today);

    const medicationsSnapshot = await admin.firestore()
      .collection('medications')
      .get();

    for (const medDoc of medicationsSnapshot.docs) {
      const medication = { id: medDoc.id, ...medDoc.data() };
      const userId = medication.userId;
      const timeSlots = medication.timeSlots || [];

      if (timeSlots.length === 0) {
        continue;
      }

      const logsSnapshot = await admin.firestore()
        .collection('medicationLogs')
        .where('userId', '==', userId)
        .where('medicationId', '==', medication.id)
        .where('date', '==', todayTimestamp)
        .get();

      const takenTimeSlots = new Set();
      logsSnapshot.forEach(logDoc => {
        const logData = logDoc.data();
        if (logData.status === 'taken' && logData.timeSlot) {
          takenTimeSlots.add(logData.timeSlot);
        }
      });

      for (const timeSlot of timeSlots) {
        const deadline = timeSlotDeadlines[timeSlot];
        
        if (deadline === undefined) {
          continue;
        }

        if (currentTime >= deadline && !takenTimeSlots.has(timeSlot)) {
          const notificationKey = `${medication.id}_${timeSlot}_${today.toDateString()}`;
          
          const existingNotifications = await admin.firestore()
            .collection('notifications')
            .where('userId', '==', userId)
            .where('medicationName', '==', medication.name)
            .where('timeSlot', '==', timeSlot)
            .where('date', '==', todayTimestamp)
            .limit(1)
            .get();

          if (existingNotifications.empty) {
            console.log(`📧 Sending notification: Patient didn't take ${medication.name} (${timeSlot})`);
            
            const userDoc = await admin.firestore().collection('users').doc(userId).get();
            if (userDoc.exists) {
              const userData = userDoc.data();
              
              const timeSlotText = timeSlot ? ` (${timeSlot})` : '';
              const mailOptions = {
                from: functions.config().email?.user || process.env.EMAIL_USER,
                to: userData.email,
                subject: `Medication Missed: ${medication.name}${timeSlotText}`,
                html: `
                  <h2>Medication Reminder</h2>
                  <p>This is to notify you that the medication <strong>${medication.name}</strong>${timeSlotText} was not marked as taken.</p>
                  <p><strong>Time:</strong> ${now.toLocaleString()}</p>
                  <p>Please check with the patient to ensure they have taken their medication.</p>
                  <p>You can mark this medication as taken from the Caretaker Dashboard if you have administered it.</p>
                `
              };
              
              try {
                await transporter.sendMail(mailOptions);
                console.log(`✅ Email sent for ${medication.name} (${timeSlot})`);
              } catch (emailError) {
                console.error(`❌ Error sending email:`, emailError);
              }

              try {
                const notification = {
                  userId,
                  type: 'missed_medication',
                  medicationName: medication.name,
                  timeSlot: timeSlot,
                  message: `Patient didn't take ${medication.name}${timeSlot ? ` (${timeSlot})` : ''}`,
                  read: false,
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  date: todayTimestamp
                };

                await admin.firestore().collection('notifications').add(notification);
                console.log(`✅ Notification saved to Firestore for ${medication.name} (${timeSlot})`);
              } catch (notificationError) {
                console.error(`❌ Error saving notification:`, notificationError);
              }
            }
          } else {
            console.log(`⏭️ Notification already sent for ${medication.name} (${timeSlot}) today`);
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error checking missed medications:', error);
    return null;
  }
});

