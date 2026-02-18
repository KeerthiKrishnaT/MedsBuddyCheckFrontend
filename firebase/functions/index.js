const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

// Configure email transporter (using Gmail as example)
// In production, use environment variables for credentials
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: functions.config().email?.user || process.env.EMAIL_USER,
    pass: functions.config().email?.pass || process.env.EMAIL_PASS
  }
});

// Cloud Function to send missed medication email
exports.sendMissedMedicationEmail = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { userId, medicationName, timeSlot, timestamp } = data;

  try {
    // Get user data
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data();
    const caretakerEmail = userData.email; // Since same user acts as both

    // Email content
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

    // Also save notification to Firestore
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
      // Don't fail the email send if notification save fails
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending email:', error);
    throw new functions.https.HttpsError('internal', 'Failed to send email');
  }
});

// Scheduled function to check for missed medications (runs every 15 minutes)
// This checks at specific times: 9:00 AM, 1:30 PM, 5:00 PM, 9:00 PM
exports.checkMissedMedications = functions.pubsub.schedule('every 15 minutes').onRun(async (context) => {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinutes; // Convert to minutes from midnight

  // Define time slot deadlines (in minutes from midnight)
  const timeSlotDeadlines = {
    'Morning': 9 * 60,        // 9:00 AM = 540 minutes
    'Afternoon': 13 * 60 + 30, // 1:30 PM = 810 minutes
    'Evening': 17 * 60,        // 5:00 PM = 1020 minutes
    'Night': 21 * 60           // 9:00 PM = 1260 minutes
  };

  // Only check at specific times (within 15 minutes after deadline)
  const checkTimes = [540, 810, 1020, 1260]; // 9 AM, 1:30 PM, 5 PM, 9 PM
  const shouldCheck = checkTimes.some(deadline => {
    const timeDiff = currentTime - deadline;
    return timeDiff >= 0 && timeDiff <= 15; // Check within 15 minutes after deadline
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

    // Get all medications (not just active ones, since we check timeSlots)
    const medicationsSnapshot = await admin.firestore()
      .collection('medications')
      .get();

    for (const medDoc of medicationsSnapshot.docs) {
      const medication = { id: medDoc.id, ...medDoc.data() };
      const userId = medication.userId;
      const timeSlots = medication.timeSlots || [];

      if (timeSlots.length === 0) {
        continue; // Skip medications without time slots
      }

      // Get today's logs for this medication
      const logsSnapshot = await admin.firestore()
        .collection('medicationLogs')
        .where('userId', '==', userId)
        .where('medicationId', '==', medication.id)
        .where('date', '==', todayTimestamp)
        .get();

      // Create a set of taken time slots
      const takenTimeSlots = new Set();
      logsSnapshot.forEach(logDoc => {
        const logData = logDoc.data();
        if (logData.status === 'taken' && logData.timeSlot) {
          takenTimeSlots.add(logData.timeSlot);
        }
      });

      // Check each time slot for this medication
      for (const timeSlot of timeSlots) {
        const deadline = timeSlotDeadlines[timeSlot];
        
        if (deadline === undefined) {
          continue; // Skip unknown time slots
        }

        // Check if we're past the deadline and medication not taken
        if (currentTime >= deadline && !takenTimeSlots.has(timeSlot)) {
          // Check if we've already sent a notification for this today
          const notificationKey = `${medication.id}_${timeSlot}_${today.toDateString()}`;
          
          // Check if notification already exists
          const existingNotifications = await admin.firestore()
            .collection('notifications')
            .where('userId', '==', userId)
            .where('medicationName', '==', medication.name)
            .where('timeSlot', '==', timeSlot)
            .where('date', '==', todayTimestamp)
            .limit(1)
            .get();

          if (existingNotifications.empty) {
            // Send notification
            console.log(`📧 Sending notification: Patient didn't take ${medication.name} (${timeSlot})`);
            
            const userDoc = await admin.firestore().collection('users').doc(userId).get();
            if (userDoc.exists) {
              const userData = userDoc.data();
              
              // Send email
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

              // Save notification to Firestore
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

