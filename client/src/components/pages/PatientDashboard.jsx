import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMedications, markMedicationAsTaken, unmarkMedicationAsTaken, getTodayMedicationStatus, getAdherenceStats, checkMedicationReminders, getMedicationLogs, checkMissedMedicationsForCaretaker } from '../../services/medicationService';
import { sendMissedMedicationEmail } from '../../services/notificationService';
import { uploadProofPhoto } from '../../services/storageService';
import { toast } from 'react-toastify';
import { FaUserMd, FaCamera, FaCheckCircle, FaChevronLeft, FaChevronRight, FaCalendar, FaBell, FaExclamationTriangle, FaSync, FaUndo } from 'react-icons/fa';
import './PatientDashboard.css';

const PatientDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [medications, setMedications] = useState([]);
  const [todayStatus, setTodayStatus] = useState([]);
  const [stats, setStats] = useState({ adherenceRate: 0, streak: 0 });
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [proofPhoto, setProofPhoto] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [reminderShown, setReminderShown] = useState({}); // Track which reminders have been shown
  const [markingInProgress, setMarkingInProgress] = useState({}); // Track which medications are being marked
  const [unmarkingInProgress, setUnmarkingInProgress] = useState({}); // Track which medications are being unmarked
  const [calendarStatus, setCalendarStatus] = useState({}); // Track daily medication status for calendar
  const [caretakerRemindersSent, setCaretakerRemindersSent] = useState(new Set()); // Track which caretaker reminders have been sent today

  useEffect(() => {
    if (user) {
      loadData();
      const reminderInterval = setInterval(() => {
        if (todayStatus.length > 0) {
          checkReminders();
        }
      }, 10 * 60 * 1000);
      
      return () => clearInterval(reminderInterval);
    }
  }, [user]);

  useEffect(() => {
    if (user && location.pathname === '/patient-dashboard') {
      loadData();
    }
  }, [location.pathname, user]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        loadData();
      }
    };

    const handleFocus = () => {
      if (user) {
        loadData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  useEffect(() => {
    if (!user || todayStatus.length === 0) {
      return;
    }

    const checkCaretakerReminders = async () => {
      try {
        const { missedMedications } = await checkMissedMedicationsForCaretaker(user.uid, todayStatus);
        
        if (missedMedications.length > 0) {
          for (const missed of missedMedications) {
            const reminderKey = `${missed.medication.id}_${missed.timeSlot}_${new Date().toDateString()}`;
            
            if (!caretakerRemindersSent.has(reminderKey)) {
              console.log(`📧 Sending caretaker reminder: Patient didn't take ${missed.medication.name} (${missed.timeSlot})`);
              
              const result = await sendMissedMedicationEmail(
                user.uid, 
                missed.medication.name, 
                missed.timeSlot
              );
              
              if (result.success) {
                console.log(`✅ Caretaker reminder sent for ${missed.medication.name} (${missed.timeSlot})`);
                setCaretakerRemindersSent(prev => new Set(prev).add(reminderKey));
                toast.info(`Reminder sent to caretaker: Patient didn't take ${missed.medication.name} (${missed.timeSlot})`);
              } else {
                console.warn(`❌ Failed to send caretaker reminder: ${result.error}`);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error checking caretaker reminders:', error);
      }
    };

    checkCaretakerReminders();

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const checkTimes = [
      { hour: 9, minute: 0, name: 'Morning' },
      { hour: 13, minute: 30, name: 'Afternoon' },
      { hour: 17, minute: 0, name: 'Evening' },
      { hour: 21, minute: 0, name: 'Night' }
    ];

    const timeouts = [];
    
    checkTimes.forEach(({ hour, minute, name }) => {
      const targetTime = hour * 60 + minute;
      let delay = targetTime - currentTime;
      
      if (delay < 0) {
        delay += 24 * 60;
      }
      
      const delayMs = delay * 60 * 1000;
      
      console.log(`⏰ Scheduling caretaker reminder check for ${name} in ${Math.round(delayMs / 60000)} minutes`);
      
      const timeout = setTimeout(() => {
        console.log(`⏰ Checking ${name} medications at ${hour}:${minute.toString().padStart(2, '0')}`);
        checkCaretakerReminders();
        
        const dailyInterval = setInterval(() => {
          checkCaretakerReminders();
        }, 24 * 60 * 60 * 1000);
        
        timeouts.push(dailyInterval);
      }, delayMs);
      
      timeouts.push(timeout);
    });

    const backupInterval = setInterval(() => {
      checkCaretakerReminders();
    }, 5 * 60 * 1000);
    
    timeouts.push(backupInterval);

    return () => {
      timeouts.forEach(timeout => {
        if (typeof timeout === 'number') {
          clearTimeout(timeout);
        } else {
          clearInterval(timeout);
        }
      });
    };
  }, [user, todayStatus, caretakerRemindersSent]);

  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    let dailyResetInterval = null;
    
    const timeout = setTimeout(() => {
      console.log('🔄 Resetting caretaker reminders for new day');
      setCaretakerRemindersSent(new Set());
      
      dailyResetInterval = setInterval(() => {
        console.log('🔄 Daily reset: Clearing caretaker reminders');
        setCaretakerRemindersSent(new Set());
      }, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
    
    return () => {
      clearTimeout(timeout);
      if (dailyResetInterval) {
        clearInterval(dailyResetInterval);
      }
    };
  }, []);

  useEffect(() => {
    if (user && todayStatus.length > 0) {
      const timeoutId = setTimeout(() => {
        checkReminders(todayStatus);
      }, 1500);
      return () => clearTimeout(timeoutId);
    }
  }, [todayStatus]);

  const loadData = async (skipReminderCheck = false) => {
    try {
      setLoading(true);
      
      console.log('Loading medications for user:', user.uid);
      
      const medsResult = await getMedications(user.uid);
      
      if (medsResult.error) {
        console.error('Error loading medications:', medsResult.error);
        toast.error(`Failed to load medications: ${medsResult.error}`);
        setMedications([]);
        setTodayStatus([]);
        setLoading(false);
        return;
      }
      
      console.log('Medications loaded:', medsResult.medications.length, medsResult.medications);
      setMedications(medsResult.medications);
      
      if (medsResult.medications.length === 0) {
        console.log('No medications found');
        setTodayStatus([]);
        setLoading(false);
        return;
      }
      
      console.log('Loading today\'s medication status...');
      const statusResult = await getTodayMedicationStatus(user.uid, medsResult.medications);
      if (statusResult.error) {
        console.error('Error loading today status:', statusResult.error);
        toast.error(`Failed to load today's status: ${statusResult.error}`);
        setTodayStatus([]);
      } else {
        console.log('Today status loaded:', statusResult.todayStatus.length, 'items');
        
        setTodayStatus(prev => {
          const newStatus = statusResult.todayStatus;
          
          const existingStatusMap = {};
          prev.forEach(item => {
            const key = `${item.medication.id}_${item.timeSlot}`;
            if (item.status === 'taken' && item.logId) {
              existingStatusMap[key] = item;
            }
          });
          
          const mergedStatus = newStatus.map(item => {
            const key = `${item.medication.id}_${item.timeSlot}`;
            const existing = existingStatusMap[key];
            
            if (existing && existing.status === 'taken' && existing.logId) {
              if (item.status === 'pending' && !item.logId) {
                console.log('🔄 Preserving taken status for:', item.medication.name, item.timeSlot, '(logId:', existing.logId, ')');
                return existing;
              } else if (item.status === 'taken' && item.logId) {
                console.log('✅ Using Firestore status for:', item.medication.name, item.timeSlot);
                return item;
              }
            }
            
            return item;
          });
          
          return mergedStatus;
        });
        
        if (!skipReminderCheck) {
          setTimeout(() => {
            checkReminders(statusResult.todayStatus);
          }, 100);
        }
      }
      
      getAdherenceStats(user.uid, currentMonth.getMonth(), currentMonth.getFullYear(), medsResult.medications)
        .then(statsResult => {
          if (!statsResult.error) {
            setStats(statsResult.stats || { adherenceRate: 0, streak: 0 });
          }
        })
        .catch(error => {
          console.error('Failed to load stats:', error);
        });

      loadCalendarStatus(medsResult.medications);
    } catch (error) {
      console.error('Load data error:', error);
      toast.error(`Failed to load data: ${error.message || error}`);
      setMedications([]);
      setTodayStatus([]);
    } finally {
      setLoading(false);
    }
  };

  const checkReminders = async (statusToCheck = null) => {
    try {
      const statusForCheck = statusToCheck || todayStatus;
      
      const { reminders: reminderList } = await checkMedicationReminders(user.uid, statusForCheck);
      
      const activeReminders = reminderList.filter(reminder => {
        const statusItem = statusForCheck.find(
          item => item.medication.id === reminder.medication.id && item.timeSlot === reminder.timeSlot
        );
        const isPending = statusItem && statusItem.status === 'pending';
        if (!isPending && statusItem) {
          console.log('🚫 Filtering out reminder for taken medication:', reminder.medication.name, reminder.timeSlot);
        }
        return isPending;
      });
      
      console.log('📋 Setting reminders:', activeReminders.length, 'active reminders out of', reminderList.length, 'total');
      setReminders(activeReminders);

      activeReminders.forEach(reminder => {
        const reminderKey = `${reminder.medication.id}_${reminder.timeSlot}`;
        
        if (!reminderShown[reminderKey]) {
          console.log('🔔 Showing reminder toast for:', reminder.medication.name, reminder.timeSlot);
          
          toast.dismiss(reminderKey);
          
          toast.warning(
            `Reminder: ${reminder.medication.name} (${reminder.timeSlot}) - Please take your medication!`,
            { 
              autoClose: 6000,
              toastId: reminderKey,
              position: 'top-right'
            }
          );
          
          setReminderShown(prev => ({ ...prev, [reminderKey]: true }));

          setTimeout(async () => {
            const { todayStatus: currentStatus } = await getTodayMedicationStatus(user.uid);
            const stillPending = currentStatus.find(
              item => item.medication.id === reminder.medication.id && 
                      item.timeSlot === reminder.timeSlot && 
                      item.status === 'pending'
            );
            
            if (stillPending) {
              const result = await sendMissedMedicationEmail(user.uid, reminder.medication.name, reminder.timeSlot);
              if (result.success) {
                toast.error(`Email sent to caretaker: ${reminder.medication.name} (${reminder.timeSlot}) still not taken`);
              } else {
                console.warn('Email notification failed:', result.error);
                toast.warning(`Reminder: ${reminder.medication.name} (${reminder.timeSlot}) still not taken`);
              }
            }
          }, 60 * 60 * 1000); // 1 hour delay
        } else {
          console.log('⏭️ Skipping reminder toast (already shown):', reminder.medication.name, reminder.timeSlot);
        }
      });
    } catch (error) {
      console.error('Error checking reminders:', error);
    }
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProofPhoto(reader.result);
      };
      reader.readAsDataURL(file);
      toast.success('Photo uploaded successfully');
    }
  };

  const markAsTaken = async (medicationId, timeSlot) => {
    const reminderKey = `${medicationId}_${timeSlot}`;
    
    if (markingInProgress[reminderKey]) {
      console.log('⏭️ Already marking, skipping...');
      return;
    }
    
    setMarkingInProgress(prev => ({ ...prev, [reminderKey]: true }));
    
    try {
      console.log('🔄 Marking medication as taken:', medicationId, timeSlot);
      
      let photoUrl = null;
      if (proofPhoto) {
        console.log('📤 Uploading proof photo...');
        const uploadResult = await uploadProofPhoto(proofPhoto, user.uid, medicationId, timeSlot);
        if (uploadResult.error) {
          console.warn('⚠️ Photo upload failed, continuing without photo:', uploadResult.error);
          toast.warning('Photo upload failed, but medication will still be marked as taken');
        } else {
          photoUrl = uploadResult.url;
          console.log('✅ Photo uploaded successfully:', photoUrl);
        }
      }
      
      const { id, error } = await markMedicationAsTaken(user.uid, medicationId, timeSlot, photoUrl, 'patient');
      
      if (error) {
        console.error('❌ Error marking medication:', error);
        toast.error(`Failed to mark medication: ${error}`, { autoClose: 5000 });
        
        setTodayStatus(prev => prev.map(item => {
          if (item.medication.id === medicationId && item.timeSlot === timeSlot && item.status === 'taken' && !item.logId) {
            return {
              ...item,
              status: 'pending',
              takenAt: undefined,
              markedBy: undefined,
              logId: undefined
            };
          }
          return item;
        }));
        
        setMarkingInProgress(prev => {
          const updated = { ...prev };
          delete updated[reminderKey];
          return updated;
        });
        return;
      }
      
      if (!id) {
        console.error('❌ No log ID returned - write may have failed');
        toast.error('Failed to mark medication: No confirmation received from server', { autoClose: 5000 });
        
        setTodayStatus(prev => prev.map(item => {
          if (item.medication.id === medicationId && item.timeSlot === timeSlot && item.status === 'taken' && !item.logId) {
            return {
              ...item,
              status: 'pending',
              takenAt: undefined,
              markedBy: undefined,
              logId: undefined
            };
          }
          return item;
        }));
        
        setMarkingInProgress(prev => {
          const updated = { ...prev };
          delete updated[reminderKey];
          return updated;
        });
        return;
      }
      
      console.log('✅ Medication marked successfully, log ID:', id);
      toast.success(`Medication marked as taken for ${timeSlot}!`, { autoClose: 3000 });
      setProofPhoto(null);
      
      setReminderShown(prev => {
        const updated = { ...prev };
        delete updated[reminderKey];
        return updated;
      });
      
      setReminders(prev => {
        const filtered = prev.filter(
          reminder => !(reminder.medication.id === medicationId && reminder.timeSlot === timeSlot)
        );
        console.log('✅ Removed reminder immediately, remaining:', filtered.length);
        return filtered;
      });
      
      setTodayStatus(prev => {
        const updated = prev.map(item => {
          if (item.medication.id === medicationId && item.timeSlot === timeSlot) {
            console.log('✅ Updating status to taken for:', item.medication.name, timeSlot, 'logId:', id);
            return {
              ...item,
              status: 'taken',
              takenAt: { toDate: () => new Date() },
              markedBy: 'patient',
              logId: id,
              proofPhotoUrl: photoUrl
            };
          }
          return item;
        });
        
        setTimeout(() => {
          console.log('✅ Rechecking reminders with updated status');
          checkReminders(updated);
        }, 150);
        
        return updated;
      });
      
      setMarkingInProgress(prev => {
        const updated = { ...prev };
        delete updated[reminderKey];
        return updated;
      });
      
      setTimeout(() => {
        console.log('🔄 Reloading data to sync with Firestore...');
        loadData(true);
        if (medications.length > 0) {
          loadCalendarStatus(medications);
        }
      }, 2000);
      
      const caretakerReminderKey = `${medicationId}_${timeSlot}_${new Date().toDateString()}`;
      setCaretakerRemindersSent(prev => {
        const updated = new Set(prev);
        updated.delete(caretakerReminderKey);
        return updated;
      });
    } catch (error) {
      console.error('❌ Exception in markAsTaken:', error);
      toast.error(`Failed to mark medication as taken: ${error.message || error}`);
      
      setMarkingInProgress(prev => {
        const updated = { ...prev };
        delete updated[reminderKey];
        return updated;
      });
    }
  };

  const unmarkAsTaken = async (medicationId, timeSlot) => {
    const unmarkKey = `${medicationId}_${timeSlot}`;
    
    if (unmarkingInProgress[unmarkKey]) {
      console.log('⏭️ Already unmarking, skipping...');
      return;
    }
    
    if (!window.confirm('Are you sure you want to unmark this medication? This will remove the record that you took it.')) {
      return;
    }
    
    setUnmarkingInProgress(prev => ({ ...prev, [unmarkKey]: true }));
    
    try {
      console.log('🔄 Unmarking medication:', medicationId, timeSlot);
      
      const { error } = await unmarkMedicationAsTaken(user.uid, medicationId, timeSlot);
      
      if (error) {
        console.error('❌ Error unmarking medication:', error);
        toast.error(`Failed to unmark medication: ${error}`, { autoClose: 5000 });
        setUnmarkingInProgress(prev => {
          const updated = { ...prev };
          delete updated[unmarkKey];
          return updated;
        });
        return;
      }
      
      console.log('✅ Medication unmarked successfully');
      toast.success(`Medication unmarked for ${timeSlot}!`, { autoClose: 3000 });
      
      setTodayStatus(prev => prev.map(item => {
        if (item.medication.id === medicationId && item.timeSlot === timeSlot) {
          console.log('✅ Updating status to pending for:', item.medication.name, timeSlot);
          return {
            ...item,
            status: 'pending',
            takenAt: undefined,
            markedBy: undefined,
            logId: undefined
          };
        }
        return item;
      }));
      
      setUnmarkingInProgress(prev => {
        const updated = { ...prev };
        delete updated[unmarkKey];
        return updated;
      });
      
      setTimeout(() => {
        console.log('🔄 Reloading data to sync with Firestore...');
        loadData(true);
        if (medications.length > 0) {
          loadCalendarStatus(medications);
        }
      }, 1000);
    } catch (error) {
      console.error('❌ Exception in unmarkAsTaken:', error);
      toast.error(`Failed to unmark medication: ${error.message || error}`);
      
      setUnmarkingInProgress(prev => {
        const updated = { ...prev };
        delete updated[unmarkKey];
        return updated;
      });
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const loadCalendarStatus = async (medications) => {
    if (!user || !medications || medications.length === 0) {
      return;
    }

    try {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0);
      endDate.setHours(23, 59, 59, 999);

      const { logs } = await getMedicationLogs(user.uid, startDate, endDate);

      const expectedPerDay = medications.reduce((total, med) => {
        return total + (med.timeSlots?.length || 1);
      }, 0);

      const logsByDate = {};
      logs.forEach(log => {
        if (log.status === 'taken') {
          const logDate = log.date?.toDate ? log.date.toDate() : new Date(log.date);
          const dateKey = logDate.toDateString();
          
          if (!logsByDate[dateKey]) {
            logsByDate[dateKey] = new Set();
          }
          // Use medicationId + timeSlot as unique key
          logsByDate[dateKey].add(`${log.medicationId}_${log.timeSlot}`);
        }
      });

      // Calculate status for each day
      const statusMap = {};
      for (let day = 1; day <= endDate.getDate(); day++) {
        const date = new Date(year, month, day);
        const dateKey = date.toDateString();
        const takenCount = logsByDate[dateKey]?.size || 0;
        
        // Green if all medications taken, red if any missed, null if no medications scheduled
        if (expectedPerDay > 0) {
          statusMap[dateKey] = takenCount >= expectedPerDay ? 'taken' : 'missed';
        }
      }

      setCalendarStatus(statusMap);
    } catch (error) {
      console.error('Error loading calendar status:', error);
    }
  };

  const getCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      date.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isToday = date.toDateString() === today.toDateString();
      const isPast = date < today;
      
      // Only show status colors for past dates and today
      // Future dates should not have any status color
      let status = null;
      
      if (isPast || isToday) {
        // Check calendar status for this date (only for past dates and today)
        const dateKey = date.toDateString();
        status = calendarStatus[dateKey] || null;
        
        // For today, check current status if calendar status not loaded yet
        if (isToday && !status && todayStatus.length > 0) {
          // Check if today's medications are all taken
          const allTaken = todayStatus.every(item => item.status === 'taken');
          const someTaken = todayStatus.some(item => item.status === 'taken');
          status = allTaken ? 'taken' : (someTaken ? 'missed' : null);
        }
      }
      // For future dates, status remains null (no color)

      days.push({
        day,
        date,
        status,
        isToday,
        isPast
      });
    }

    return days;
  };

  const navigateMonth = (direction) => {
    const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1);
    setCurrentMonth(newMonth);
    // Reload calendar status when month changes
    if (medications.length > 0) {
      loadCalendarStatus(medications);
    }
  };

  const switchToCaretaker = () => {
    navigate('/caretaker-dashboard');
  };

  if (loading) {
    return (
      <div className="patient-dashboard">
        <div className="dashboard-header">
          <div className="header-left">
            <div className="logo">
              <div className="logo-circle patient">M</div>
              <div>
                <h1>MediCare Companion</h1>
                <p className="view-label">Patient View</p>
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div className="loading" style={{ fontSize: '18px' }}>Loading your medications...</div>
          <div style={{ marginTop: '20px', color: '#666' }}>Please wait while we fetch your data</div>
        </div>
      </div>
    );
  }

  // Group medications by time slot
  const groupByTimeSlot = (items) => {
    const timeSlotOrder = ['Morning', 'Afternoon', 'Evening', 'Night'];
    const grouped = {};
    
    items.forEach(item => {
      if (!grouped[item.timeSlot]) {
        grouped[item.timeSlot] = [];
      }
      grouped[item.timeSlot].push(item);
    });

    return timeSlotOrder.filter(slot => grouped[slot] && grouped[slot].length > 0).map(slot => ({
      slot,
      medications: grouped[slot]
    }));
  };

  const todayMedicationsBySlot = groupByTimeSlot(todayStatus);

  return (
    <div className="patient-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <div className="logo">
            <div className="logo-circle patient">M</div>
            <div>
              <h1>MediCare Companion</h1>
              <p className="view-label">Patient View</p>
            </div>
          </div>
        </div>
        <div className="header-right" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            onClick={loadData} 
            className="btn-switch"
            style={{ 
              background: '#f0f0f0', 
              color: '#333',
              border: '1px solid #ddd',
              padding: '8px 16px'
            }}
            title="Refresh medications"
          >
            <FaSync /> Refresh
          </button>
          <button onClick={switchToCaretaker} className="btn-switch">
            <FaUserMd /> Switch to Caretaker
          </button>
        </div>
      </div>

      {/* Dashboard Overview */}
      <div className="dashboard-overview">
        <div className="overview-content">
          <div className="greeting-section">
            <FaUserMd className="greeting-icon" />
            <div>
              <h2>{getGreeting()}! Ready to stay on track with your medication?</h2>
            </div>
          </div>
          <div className="overview-metrics">
            <div className="overview-metric">
              <div className="metric-value-large">{stats.streak || 0}</div>
              <div className="metric-label-large">Day Streak</div>
            </div>
            <div className="overview-metric">
              <div className="metric-value-large">{stats.adherenceRate || 0}%</div>
              <div className="metric-label-large">Monthly Rate</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-content">
        <div className="grid grid-2">
          {/* Today's Medication */}
          <div className="card">
            <div className="card-header">
              <FaCalendar className="card-icon" />
              <h3>Today's Medication</h3>
              <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '5px', fontStyle: 'italic' }}>
                📋 View only - Medications are managed by your caretaker
              </div>
            </div>
            
            {todayMedicationsBySlot.length === 0 ? (
              <div className="no-medications">
                <p>No medications scheduled for today.</p>
                <p style={{ fontSize: '0.9rem', color: '#999', marginTop: '10px' }}>
                  Go to Caretaker view to add medications.
                </p>
              </div>
            ) : (
              <div className="medication-list-today">
                {/* Reminders Section */}
                {reminders.length > 0 && (
                  <div style={{ 
                    background: '#fff3cd', 
                    border: '1px solid #ffc107', 
                    borderRadius: '8px', 
                    padding: '15px', 
                    marginBottom: '20px' 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                      <FaExclamationTriangle style={{ color: '#ff9800' }} />
                      <strong>Reminders</strong>
                    </div>
                    {reminders.map((reminder, idx) => (
                      <div key={idx} style={{ marginBottom: '8px', fontSize: '0.9rem' }}>
                        <FaBell style={{ marginRight: '8px', color: '#ff9800' }} />
                        {reminder.medication.name} ({reminder.timeSlot}) - Please take your medication!
                      </div>
                    ))}
                  </div>
                )}

                {/* Medications by Time Slot */}
                {todayMedicationsBySlot.map(({ slot, medications }) => (
                  <div key={slot} style={{ marginBottom: '30px', borderBottom: '2px solid #e0e0e0', paddingBottom: '20px' }}>
                    <h4 style={{ 
                      color: '#4CAF50', 
                      marginBottom: '15px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '10px' 
                    }}>
                      <FaCalendar /> {slot} Medications
                    </h4>
                    
                    {medications.map((item, index) => {
                      const hasReminder = reminders.some(
                        r => r.medication.id === item.medication.id && r.timeSlot === item.timeSlot
                      );
                      
                      return (
                        <div 
                          key={`${item.medication.id}_${item.timeSlot}`} 
                          className="medication-item-today"
                          style={{ 
                            border: hasReminder ? '2px solid #ff9800' : '1px solid #e0e0e0',
                            background: hasReminder ? '#fff3cd' : '#fff'
                          }}
                        >
                          <div className="medication-number">{index + 1}</div>
                          <div className="medication-details">
                            <div className="medication-name">
                              {item.medication.name}
                              {hasReminder && <FaBell style={{ marginLeft: '8px', color: '#ff9800' }} />}
                            </div>
                            <div className="medication-description">
                              {item.medication.dosage} - {item.medication.frequency}
                            </div>
                            {item.medication.foodTiming && (
                              <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>
                                {item.medication.foodTiming.charAt(0).toUpperCase() + item.medication.foodTiming.slice(1)} Food
                              </div>
                            )}
                          </div>
                          <div className="medication-actions">
                            {item.status === 'pending' ? (
                              <button
                                onClick={() => markAsTaken(item.medication.id, item.timeSlot)}
                                className="btn btn-success btn-sm"
                                style={{ 
                                  padding: '8px 16px', 
                                  fontSize: '0.9rem',
                                  opacity: markingInProgress[`${item.medication.id}_${item.timeSlot}`] ? 0.6 : 1,
                                  cursor: markingInProgress[`${item.medication.id}_${item.timeSlot}`] ? 'wait' : 'pointer'
                                }}
                                disabled={markingInProgress[`${item.medication.id}_${item.timeSlot}`]}
                              >
                                <FaCheckCircle /> {markingInProgress[`${item.medication.id}_${item.timeSlot}`] ? 'Marking...' : 'Mark Taken'}
                              </button>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <button
                                    className="btn btn-success btn-sm"
                                    style={{ 
                                      padding: '8px 16px', 
                                      fontSize: '0.9rem',
                                      background: '#4CAF50',
                                      color: '#fff',
                                      border: 'none',
                                      cursor: 'default',
                                      opacity: 0.9
                                    }}
                                    disabled
                                  >
                                    <FaCheckCircle /> Completed
                                    {item.markedBy === 'caretaker' && (
                                      <span style={{ fontSize: '0.8rem', marginLeft: '8px', opacity: 0.9 }}>
                                        (by caretaker)
                                      </span>
                                    )}
                                  </button>
                                  {/* Only show unmark button if marked by patient (not caretaker) */}
                                  {/* Show unmark if markedBy is 'patient' or undefined (default is patient) */}
                                  {(item.markedBy === 'patient' || !item.markedBy) && (
                                    <button
                                      onClick={() => unmarkAsTaken(item.medication.id, item.timeSlot)}
                                      className="btn btn-secondary btn-sm"
                                      style={{ 
                                        padding: '8px 12px', 
                                        fontSize: '0.85rem',
                                        background: '#f44336',
                                        color: '#fff',
                                        border: 'none',
                                        opacity: unmarkingInProgress[`${item.medication.id}_${item.timeSlot}`] ? 0.6 : 1,
                                        cursor: unmarkingInProgress[`${item.medication.id}_${item.timeSlot}`] ? 'wait' : 'pointer'
                                      }}
                                      disabled={unmarkingInProgress[`${item.medication.id}_${item.timeSlot}`]}
                                      title="Unmark medication (if marked by mistake)"
                                    >
                                      {unmarkingInProgress[`${item.medication.id}_${item.timeSlot}`] ? (
                                        <>Unmarking...</>
                                      ) : (
                                        <><FaUndo /> Unmark</>
                                      )}
                                    </button>
                                  )}
                                </div>
                                {item.takenAt && (
                                  <span style={{ fontSize: '0.75rem', color: '#666' }}>
                                    {item.takenAt.toDate ? 
                                      item.takenAt.toDate().toLocaleTimeString('en-US', { 
                                        hour: '2-digit', 
                                        minute: '2-digit',
                                        hour12: true 
                                      }) :
                                      new Date(item.takenAt).toLocaleTimeString('en-US', { 
                                        hour: '2-digit', 
                                        minute: '2-digit',
                                        hour12: true 
                                      })
                                    }
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Proof Photo Section */}
                <div className="proof-photo-section" style={{ marginTop: '20px' }}>
                  <div className="proof-photo-label">Add Proof Photo (Optional)</div>
                  <div className="proof-photo-box">
                    {proofPhoto ? (
                      <div className="proof-photo-preview">
                        <img src={proofPhoto} alt="Proof" />
                        <button
                          onClick={() => setProofPhoto(null)}
                          className="remove-photo-btn"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <>
                        <FaCamera className="camera-icon" />
                        <p>Take a photo of your medication or pill organizer as confirmation.</p>
                      </>
                    )}
                  </div>
                  {!proofPhoto && (
                    <label className="btn btn-secondary take-photo-btn">
                      <FaCamera /> Take Photo
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoUpload}
                        style={{ display: 'none' }}
                      />
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Medication Calendar */}
          <div className="card">
            <div className="card-header">
              <FaCalendar className="card-icon" />
              <h3>Medication Calendar</h3>
            </div>
            
            <div className="calendar-container">
              <div className="calendar-header">
                <button onClick={() => navigateMonth(-1)} className="calendar-nav-btn">
                  <FaChevronLeft />
                </button>
                <h4>
                  {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </h4>
                <button onClick={() => navigateMonth(1)} className="calendar-nav-btn">
                  <FaChevronRight />
                </button>
              </div>

              <div className="calendar-grid">
                <div className="calendar-weekdays">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                    <div key={day} className="weekday">{day}</div>
                  ))}
                </div>
                <div className="calendar-days">
                  {getCalendarDays().map((dayData, index) => {
                    if (dayData === null) {
                      return <div key={`empty-${index}`} className="calendar-day empty"></div>;
                    }
                    // Determine the class: today takes priority, then status (only for past dates and today)
                    let dayClass = 'calendar-day';
                    let titleText = '';
                    
                    if (dayData.isToday) {
                      dayClass += ' today';
                      // If today has status, add it as well (but today styling takes priority)
                      if (dayData.status) {
                        dayClass += ` ${dayData.status}`;
                        titleText = dayData.status === 'taken' ? 'All medications taken' : 'Some medications missed';
                      } else {
                        titleText = 'Today';
                      }
                    } else if (dayData.isPast && dayData.status) {
                      // Only show status for past dates
                      dayClass += ` ${dayData.status}`;
                      titleText = dayData.status === 'taken' ? 'All medications taken' : 'Some medications missed';
                    } else if (!dayData.isPast && !dayData.isToday) {
                      // Future date - no status color, just default styling
                      titleText = 'Future date';
                    }
                    
                    return (
                      <div
                        key={dayData.day}
                        className={dayClass}
                        title={titleText}
                      >
                        {dayData.day}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="calendar-legend">
                <div className="legend-item">
                  <div className="legend-circle taken" style={{ background: '#4CAF50' }}></div>
                  <span>All medications taken (Green)</span>
                </div>
                <div className="legend-item">
                  <div className="legend-circle missed" style={{ background: '#f44336' }}></div>
                  <span>Some medications missed (Red)</span>
                </div>
                <div className="legend-item">
                  <div className="legend-circle today-legend"></div>
                  <span>Today</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientDashboard;

