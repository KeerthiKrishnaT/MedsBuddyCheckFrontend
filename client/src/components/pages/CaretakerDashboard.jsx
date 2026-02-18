import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getMedications, getTodayMedicationStatus, getAdherenceStats, markMedicationAsTaken, getMedicationLogs, subscribeToTodayMedicationLogs } from '../../services/medicationService';
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead, subscribeToNotifications, getUnreadNotificationCount } from '../../services/notificationService';
import { Timestamp } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { FaUserMd, FaEnvelope, FaBell, FaCalendar, FaUser, FaCheckCircle, FaTimesCircle, FaClock, FaPills, FaSync, FaImage, FaTimes, FaChevronLeft, FaChevronRight, FaExclamationCircle } from 'react-icons/fa';
import { useNavigate, useLocation } from 'react-router-dom';
import './CaretakerDashboard.css';

const CaretakerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation(); // For detecting route changes
  const [medications, setMedications] = useState([]);
  const [todayStatus, setTodayStatus] = useState([]);
  const [stats, setStats] = useState({
    adherenceRate: 0,
    currentStreak: 0,
    missedThisMonth: 0,
    takenThisWeek: 0
  });
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarStatus, setCalendarStatus] = useState({}); // Track daily medication status for calendar
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [currentPhoto, setCurrentPhoto] = useState(null);

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  useEffect(() => {
    if (user && location.pathname === '/caretaker-dashboard') {
      console.log('🔄 Refreshing caretaker dashboard data...');
      loadDashboardData();
    }
  }, [location.pathname, user]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        console.log('🔄 Page visible, refreshing data...');
        loadDashboardData();
      }
    };

    const handleFocus = () => {
      if (user) {
        console.log('🔄 Window focused, refreshing data...');
        loadDashboardData();
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
    if (!user || !medications.length) {
      console.log('⏳ Waiting for medications to load before setting up real-time listener...');
      return;
    }

    console.log('👂 Setting up real-time listener for medication updates...', {
      userId: user.uid,
      medicationCount: medications.length
    });
    
    let previousStatus = null;
    
    let unsubscribe;
    try {
      unsubscribe = subscribeToTodayMedicationLogs(user.uid, ({ logs, error }) => {
        if (error) {
          console.error('❌ Real-time listener error:', error);
          console.log('🔄 Falling back to manual refresh due to listener error...');
          loadDashboardData(true);
          return;
        }

        console.log('🔄 Real-time update received:', logs.length, 'logs');
        console.log('📋 Log details:', logs.map(log => ({
          id: log.id,
          medicationId: log.medicationId,
          timeSlot: log.timeSlot,
          status: log.status,
          markedBy: log.markedBy,
          date: log.date?.toDate ? log.date.toDate().toISOString() : 'N/A'
        })));
        
        if (logs.length > 0 || medications.length > 0) {
          console.log('🔄 Recalculating status with', logs.length, 'logs and', medications.length, 'medications...');
          getTodayMedicationStatus(user.uid, medications)
            .then(statusResult => {
              if (statusResult.error) {
                console.error('❌ Error getting today status:', statusResult.error);
                return;
              }
              
              if (!statusResult.todayStatus) {
                console.error('❌ No todayStatus returned');
                return;
              }
              
              console.log('✅ Updated status from real-time listener:', statusResult.todayStatus.length, 'items');
              console.log('📊 Status details:', statusResult.todayStatus.map(item => ({
                medication: item.medication.name,
                timeSlot: item.timeSlot,
                status: item.status,
                markedBy: item.markedBy,
                logId: item.logId
              })));
              
              // Check if any medication status changed by comparing with previous status
              const hasChanges = previousStatus === null || 
                JSON.stringify(statusResult.todayStatus) !== JSON.stringify(previousStatus);
              
              if (hasChanges) {
                console.log('🔄 Status changed - updating UI...');
                
                // Show a subtle notification if patient marked a medication
                if (previousStatus !== null) {
                  const patientMarked = statusResult.todayStatus.find(
                    item => item.status === 'taken' && 
                           item.markedBy === 'patient' &&
                           !previousStatus.find(t => t.medication.id === item.medication.id && 
                                                   t.timeSlot === item.timeSlot && 
                                                   t.status === 'taken')
                  );
                  
                  if (patientMarked) {
                    console.log('🔔 Patient marked medication:', patientMarked.medication.name, patientMarked.timeSlot);
                    toast.info(`${patientMarked.medication.name} (${patientMarked.timeSlot}) was marked as taken by patient`, {
                      autoClose: 3000,
                      position: 'top-right'
                    });
                  }
                }
                
                // Update the status
                setTodayStatus(statusResult.todayStatus);
                previousStatus = statusResult.todayStatus; // Update previous status
              } else {
                console.log('⏭️ No status changes detected');
              }
            })
            .catch(error => {
              console.error('❌ Error updating status from real-time listener:', error);
              // Fallback: manually refresh
              loadDashboardData(true);
            });
        }
      });
      
      if (!unsubscribe || typeof unsubscribe !== 'function') {
        console.error('❌ Failed to set up real-time listener - unsubscribe function not returned');
        // Fallback to periodic refresh
        console.log('🔄 Falling back to periodic refresh only...');
      } else {
        console.log('✅ Real-time listener set up successfully');
      }
    } catch (error) {
      console.error('❌ Error setting up real-time listener:', error);
      // Fallback to periodic refresh
    }

    // Cleanup: unsubscribe when component unmounts or dependencies change
    return () => {
      console.log('🔇 Cleaning up real-time listener...');
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [user, medications]); // Re-run when user or medications change

  // Periodic refresh every 60 seconds as a backup (reduced frequency since we have real-time updates)
  useEffect(() => {
    if (user) {
      const refreshInterval = setInterval(() => {
        console.log('🔄 Periodic refresh of caretaker dashboard (backup)...');
        loadDashboardData(true); // Skip loading state for periodic refresh
      }, 60 * 1000); // Refresh every 60 seconds (backup)
      
      return () => clearInterval(refreshInterval);
    }
  }, [user]);

  const loadDashboardData = async (skipLoadingState = false) => {
    try {
      if (!skipLoadingState) {
        setLoading(true);
      }
      
      console.log('📊 Loading caretaker dashboard data for user:', user.uid);
      
      // First, fetch medications once
      const medsResult = await getMedications(user.uid);
      
      if (medsResult.error) {
        console.error('❌ Error loading medications:', medsResult.error);
        toast.error('Failed to load medications');
        if (!skipLoadingState) {
          setLoading(false);
        }
        return;
      }
      
      console.log('✅ Medications loaded:', medsResult.medications.length);
      setMedications(medsResult.medications);
      
      // Fetch status first (most important for user)
      console.log('📋 Loading today\'s medication status...');
      const statusResult = await getTodayMedicationStatus(user.uid, medsResult.medications);
      if (statusResult.error) {
        console.error('❌ Error loading today status:', statusResult.error);
        toast.error(`Failed to load today's status: ${statusResult.error}`);
      } else {
        console.log('✅ Today status loaded:', statusResult.todayStatus.length, 'items');
        
        // Detailed breakdown for debugging
        const statusBreakdown = {
          pending: statusResult.todayStatus.filter(s => s.status === 'pending').length,
          taken: statusResult.todayStatus.filter(s => s.status === 'taken').length,
          byPatient: statusResult.todayStatus.filter(s => s.status === 'taken' && s.markedBy === 'patient').length,
          byCaretaker: statusResult.todayStatus.filter(s => s.status === 'taken' && s.markedBy === 'caretaker').length,
          withLogId: statusResult.todayStatus.filter(s => s.status === 'taken' && s.logId).length,
          withoutLogId: statusResult.todayStatus.filter(s => s.status === 'taken' && !s.logId).length,
          withPhoto: statusResult.todayStatus.filter(s => s.status === 'taken' && s.proofPhotoUrl).length,
          withoutPhoto: statusResult.todayStatus.filter(s => s.status === 'taken' && !s.proofPhotoUrl).length
        };
        console.log('📊 Status breakdown:', statusBreakdown);
        
        // Log each medication status for debugging
        statusResult.todayStatus.forEach(item => {
          if (item.status === 'taken') {
            console.log(`  ✅ ${item.medication.name} (${item.timeSlot}): Taken by ${item.markedBy || 'unknown'}, logId: ${item.logId || 'none'}, photo: ${item.proofPhotoUrl ? 'YES (' + (item.proofPhotoUrl.substring(0, 50) + '...') : 'NO'}`);
            if (item.proofPhotoUrl) {
              console.log(`     📷 Photo URL: ${item.proofPhotoUrl}`);
            }
          } else {
            console.log(`  ⏳ ${item.medication.name} (${item.timeSlot}): Pending`);
          }
        });
        
        setTodayStatus(statusResult.todayStatus);
      }
      
      // Then fetch stats in background (less critical, can load slower)
      getAdherenceStats(user.uid, new Date().getMonth(), new Date().getFullYear(), medsResult.medications)
        .then(statsResult => {
          if (!statsResult.error) {
            setStats({
              adherenceRate: statsResult.stats?.adherenceRate || 0,
              currentStreak: statsResult.stats?.streak || 0,
              missedThisMonth: statsResult.stats?.missedCount || 0,
              takenThisWeek: statsResult.stats?.takenCount || 0
            });
          }
        })
        .catch(error => {
          console.error('Failed to load stats:', error);
        });

      // Reload recent logs if activity tab is active
      if (activeTab === 'activity' && recentLogs.length > 0) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        getMedicationLogs(user.uid, startDate, endDate, 20)
          .then(({ logs }) => {
            setRecentLogs(logs.filter(log => log.status === 'taken'));
          })
          .catch(error => {
            console.error('Error refreshing logs:', error);
          });
      }
    } catch (error) {
      console.error('❌ Load dashboard data error:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      if (!skipLoadingState) {
        setLoading(false);
      }
    }
  };

  const sendReminder = async () => {
    toast.info('Reminder email sent!');
  };

  const markAsTakenByCaretaker = async (medicationId, timeSlot) => {
    try {
      console.log('🔄 Caretaker marking medication as taken:', medicationId, timeSlot);
      const { id, error } = await markMedicationAsTaken(user.uid, medicationId, timeSlot, null, 'caretaker');
      
      if (error) {
        console.error('❌ Error marking medication:', error);
        toast.error(`Failed to mark medication: ${error}`, { autoClose: 5000 });
        return;
      }
      
      if (!id) {
        console.error('❌ No log ID returned - write may have failed');
        toast.error('Failed to mark medication: No confirmation received from server', { autoClose: 5000 });
        return;
      }
      
      console.log('✅ Medication marked successfully by caretaker, log ID:', id);
      toast.success(`Medication marked as taken for ${timeSlot}!`);
      
      // Immediately update the status in state to remove from pending list
      setTodayStatus(prev => prev.map(item => {
        if (item.medication.id === medicationId && item.timeSlot === timeSlot) {
          return {
            ...item,
            status: 'taken',
            takenAt: { toDate: () => new Date() }, // Temporary until reload
            markedBy: 'caretaker',
            logId: id // Store the log ID for persistence
          };
        }
        return item;
      }));
      
      // Reload data after a delay to get accurate timestamps and sync everything
      setTimeout(() => {
        console.log('🔄 Reloading caretaker dashboard data...');
        loadDashboardData(true); // Pass true to skip loading state (already updated optimistically)
      }, 2000); // Increased delay to 2 seconds to ensure Firestore has updated
    } catch (error) {
      console.error('❌ Exception in markAsTakenByCaretaker:', error);
      toast.error(`Failed to mark medication as taken: ${error.message || error}`);
    }
  };

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

  const switchToPatient = () => {
    navigate('/patient-dashboard');
  };

  // Load calendar status for the current month
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

      // Get all logs for the month
      const { logs } = await getMedicationLogs(user.uid, startDate, endDate);

      // Calculate expected medications per day (all time slots for all medications)
      const expectedPerDay = medications.reduce((total, med) => {
        return total + (med.timeSlots?.length || 1);
      }, 0);

      // Group logs by date
      const logsByDate = {};
      logs.forEach(log => {
        if (log.status === 'taken') {
          const logDate = log.date?.toDate ? log.date.toDate() : new Date(log.date);
          logDate.setHours(0, 0, 0, 0);
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
        date.setHours(0, 0, 0, 0);
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

  const loadNotifications = async () => {
    if (!user) return;
    
    try {
      setLoadingNotifications(true);
      const { notifications: notifs, error } = await getNotifications(user.uid, 100);
      if (error) {
        console.error('Error loading notifications:', error);
        toast.error('Failed to load notifications');
      } else {
        setNotifications(notifs);
        const unread = notifs.filter(n => !n.read).length;
        setUnreadCount(unread);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
      toast.error('Failed to load notifications');
    } finally {
      setLoadingNotifications(false);
    }
  };

  const loadUnreadCount = async () => {
    if (!user) return;
    
    try {
      const { count, error } = await getUnreadNotificationCount(user.uid);
      if (!error) {
        setUnreadCount(count);
      }
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  };

  const handleMarkAsRead = async (notificationId) => {
    try {
      const { error } = await markNotificationAsRead(notificationId);
      if (error) {
        toast.error('Failed to mark notification as read');
      } else {
        // Update local state
        setNotifications(prev => prev.map(n => 
          n.id === notificationId ? { ...n, read: true, readAt: Timestamp.now() } : n
        ));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
      toast.error('Failed to mark notification as read');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const { error } = await markAllNotificationsAsRead(user.uid);
      if (error) {
        toast.error('Failed to mark all notifications as read');
      } else {
        // Update local state
        setNotifications(prev => prev.map(n => ({ ...n, read: true, readAt: Timestamp.now() })));
        setUnreadCount(0);
        toast.success('All notifications marked as read');
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      toast.error('Failed to mark all notifications as read');
    }
  };

  const handleViewPhoto = (photoUrl, medicationName, timeSlot, date, takenAt, markedBy) => {
    setCurrentPhoto({ photoUrl, medicationName, timeSlot, date, takenAt, markedBy });
    setShowPhotoModal(true);
  };

  const closePhotoModal = () => {
    setShowPhotoModal(false);
    setCurrentPhoto(null);
  };

  if (loading) {
    return (
      <div className="caretaker-dashboard">
        <div className="dashboard-header">
          <div className="header-left">
            <div className="logo">
              <div className="logo-circle">M</div>
              <div>
                <h1>MediCare Companion</h1>
                <p className="view-label">Caretaker View</p>
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div className="loading" style={{ fontSize: '18px' }}>Loading dashboard...</div>
          <div style={{ marginTop: '20px', color: '#666' }}>Please wait while we fetch your data</div>
        </div>
      </div>
    );
  }

  const todayMedicationsBySlot = groupByTimeSlot(todayStatus);
  const pendingMedications = todayStatus.filter(item => item.status === 'pending');

  return (
    <div className="caretaker-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <div className="logo">
            <div className="logo-circle">M</div>
            <div>
              <h1>MediCare Companion</h1>
              <p className="view-label">Caretaker View</p>
            </div>
          </div>
        </div>
        <div className="header-right" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            onClick={() => loadDashboardData()} 
            className="btn-switch"
            style={{ 
              background: '#f0f0f0', 
              color: '#333',
              border: '1px solid #ddd',
              padding: '8px 16px'
            }}
            title="Refresh medication status"
          >
            <FaSync /> Refresh
          </button>
          <button onClick={switchToPatient} className="btn-switch">
            <FaUser /> Switch to Patient
          </button>
        </div>
      </div>

      {/* Dashboard Banner */}
      <div className="dashboard-banner">
        <div className="banner-content">
          <div className="banner-icon">
            <FaUserMd />
          </div>
          <div className="banner-text">
            <h2>Caretaker Dashboard</h2>
            <p>Monitoring {user?.name || 'Patient'}'s medication adherence.</p>
          </div>
        </div>
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-value">{stats.adherenceRate}%</div>
            <div className="metric-label">Adherence Rate</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{stats.currentStreak}</div>
            <div className="metric-label">Current Streak</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{stats.missedThisMonth}</div>
            <div className="metric-label">Missed This Month</div>
          </div>
          <div className="metric-card">
            <div className="metric-value">{stats.takenThisWeek}</div>
            <div className="metric-label">Taken This Week</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="nav-tabs">
        <button
          className={activeTab === 'overview' ? 'tab active' : 'tab'}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={activeTab === 'activity' ? 'tab active' : 'tab'}
          onClick={async () => {
            setActiveTab('activity');
            // Always reload logs when activity tab is clicked to get latest data
            setLoadingLogs(true);
            try {
              const endDate = new Date();
              const startDate = new Date();
              startDate.setDate(startDate.getDate() - 7);
              const { logs, error } = await getMedicationLogs(user.uid, startDate, endDate, 20);
              if (error) {
                console.error('Error loading logs:', error);
                toast.error('Failed to load activity');
              } else {
                setRecentLogs(logs.filter(log => log.status === 'taken'));
              }
            } catch (error) {
              console.error('Error loading logs:', error);
              toast.error('Failed to load activity');
            } finally {
              setLoadingLogs(false);
            }
          }}
        >
          Recent Activity
        </button>
        <button
          className={activeTab === 'calendar' ? 'tab active' : 'tab'}
          onClick={async () => {
            setActiveTab('calendar');
            // Load calendar status when calendar tab is clicked
            if (medications.length > 0) {
              loadCalendarStatus(medications);
            }
          }}
        >
          Calendar View
        </button>
        <button
          className={activeTab === 'notifications' ? 'tab active' : 'tab'}
          onClick={() => {
            setActiveTab('notifications');
            loadNotifications();
          }}
          style={{ position: 'relative' }}
        >
          Notifications
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              background: '#ef4444',
              color: '#fff',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7rem',
              fontWeight: 'bold'
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Content Based on Active Tab */}
      {activeTab === 'overview' && (
        <div className="overview-content">
          <div className="grid grid-2">
            {/* Today's Status */}
            <div className="card">
              <div className="card-header">
                <FaCalendar className="card-icon" />
                <h3>Today's Status</h3>
              </div>
              <div className="status-list">
                {pendingMedications.length === 0 ? (
                  <p style={{ color: '#666' }}>All medications taken for today!</p>
                ) : (
                  <div>
                    {todayMedicationsBySlot.map(({ slot, medications }) => (
                      <div key={slot} style={{ marginBottom: '20px' }}>
                        <h4 style={{ 
                          color: '#4CAF50', 
                          marginBottom: '10px', 
                          fontSize: '1rem',
                          fontWeight: 'bold'
                        }}>
                          {slot}
                        </h4>
                        {medications.map((item) => (
                          <div key={`${item.medication.id}_${item.timeSlot}`} className="status-item">
                            <div className="status-info">
                              <div className="status-name">{item.medication.name}</div>
                              <div className="status-details">
                                <div style={{ fontSize: '0.85rem', color: '#666' }}>
                                  {item.medication.dosage} - {item.medication.frequency}
                                </div>
                                {item.medication.foodTiming && (
                                  <div style={{ fontSize: '0.8rem', color: '#999', marginTop: '4px' }}>
                                    {item.medication.foodTiming.charAt(0).toUpperCase() + item.medication.foodTiming.slice(1)} Food
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {item.status === 'pending' ? (
                                <>
                                  <span className="status-badge pending">
                                    <FaClock /> Pending
                                  </span>
                                  <button
                                    onClick={() => markAsTakenByCaretaker(item.medication.id, item.timeSlot)}
                                    className="btn btn-success btn-sm"
                                    style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                                  >
                                    <FaCheckCircle /> Mark Taken
                                  </button>
                                </>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                  <span className="status-badge taken" style={{ background: '#4CAF50', color: '#fff' }}>
                                    <FaCheckCircle /> Taken
                                    {item.markedBy === 'patient' && (
                                      <span style={{ fontSize: '0.8rem', marginLeft: '8px' }}>
                                        (by patient)
                                      </span>
                                    )}
                                    {item.markedBy === 'caretaker' && (
                                      <span style={{ fontSize: '0.8rem', marginLeft: '8px' }}>
                                        (by you)
                                      </span>
                                    )}
                                  </span>
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
                                  {/* Show proof photo if available */}
                                  {item.proofPhotoUrl && item.proofPhotoUrl.trim() !== '' && (
                                    <div style={{ marginTop: '8px' }}>
                                      <button
                                        onClick={() => {
                                          console.log('🖼️ Viewing photo for:', item.medication.name, item.timeSlot, 'URL:', item.proofPhotoUrl);
                                          handleViewPhoto(
                                            item.proofPhotoUrl, 
                                            item.medication.name, 
                                            item.timeSlot, 
                                            item.takenAt?.toDate ? item.takenAt.toDate() : new Date(item.takenAt),
                                            item.takenAt?.toDate ? item.takenAt.toDate() : new Date(item.takenAt),
                                            item.markedBy
                                          );
                                        }}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          padding: '4px 8px',
                                          background: '#e3f2fd',
                                          border: '1px solid #2196F3',
                                          borderRadius: '4px',
                                          cursor: 'pointer',
                                          fontSize: '0.75rem',
                                          color: '#1976D2'
                                        }}
                                        title="View proof photo"
                                      >
                                        <FaImage /> View Photo
                                      </button>
                                    </div>
                                  )}
                                  {/* Debug: Show if photo URL exists but button not showing */}
                                  {item.status === 'taken' && !item.proofPhotoUrl && (
                                    <div style={{ fontSize: '0.7rem', color: '#999', marginTop: '4px' }}>
                                      (No photo)
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="card">
              <div className="card-header">
                <h3>Quick Actions</h3>
              </div>
              <div className="quick-actions">
                <button 
                  onClick={() => navigate('/medications')} 
                  className="action-btn"
                  style={{ background: '#4CAF50', color: '#fff', fontWeight: 'bold' }}
                >
                  <FaPills /> Add/Manage Medications
                </button>
                <button onClick={sendReminder} className="action-btn">
                  <FaEnvelope /> Send Reminder Email
                </button>
                <button className="action-btn">
                  <FaBell /> Configure Notifications
                </button>
              </div>
              <div style={{ marginTop: '15px', padding: '15px', background: '#f0f7ff', borderRadius: '8px', fontSize: '0.9rem', color: '#333' }}>
                <strong>💡 Note:</strong> As a caretaker, you can add, edit, and delete medications. 
                The patient can only view and mark medications as taken. All changes you make will be visible to the patient immediately.
              </div>
            </div>
          </div>

          {/* Monthly Adherence Progress */}
          <div className="card">
            <div className="progress-header">
              <div>
                <h3>Monthly Adherence Progress</h3>
                <p className="subtitle">Overall Progress</p>
              </div>
              <div className="progress-percentage">
                {stats.adherenceRate}%
              </div>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar">
                <div
                  className="progress-segment taken"
                  style={{ width: `${(stats.takenThisWeek / 30) * 100}%` }}
                >
                  <span className="segment-label">
                    {stats.takenThisWeek} days Taken
                  </span>
                </div>
                <div
                  className="progress-segment missed"
                  style={{ width: `${(stats.missedThisMonth / 30) * 100}%` }}
                >
                  <span className="segment-label">
                    {stats.missedThisMonth} days Missed
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="card">
          <div className="card-header">
            <FaCalendar className="card-icon" />
            <h3>Recent Medication Activity</h3>
            <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '5px' }}>
              View when medications were marked as taken (last 7 days)
            </p>
          </div>
          {loadingLogs ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div className="loading">Loading activity...</div>
            </div>
          ) : recentLogs.length === 0 ? (
            <p style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
              No medication activity in the last 7 days.
            </p>
          ) : (
            <div style={{ marginTop: '20px' }}>
              {recentLogs.map((log) => {
                const logDate = log.date?.toDate ? log.date.toDate() : new Date(log.date);
                const takenTime = log.takenAt?.toDate ? log.takenAt.toDate() : new Date(log.takenAt);
                const isToday = logDate.toDateString() === new Date().toDateString();
                
                // Find medication name from medications array
                const medication = medications.find(m => m.id === log.medicationId);
                const medicationName = medication ? medication.name : 'Unknown Medication';
                
                return (
                  <div 
                    key={log.id} 
                    style={{ 
                      padding: '15px', 
                      borderBottom: '1px solid #e0e0e0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>
                        {medicationName}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '4px' }}>
                        <span style={{ background: '#e3f2fd', padding: '2px 8px', borderRadius: '4px', marginRight: '8px' }}>
                          {log.timeSlot || 'N/A'}
                        </span>
                        {isToday ? 'Today' : logDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {' • '}
                        {takenTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FaCheckCircle style={{ color: '#4CAF50' }} />
                        <span style={{ fontSize: '0.85rem', color: '#666' }}>
                          {log.markedBy === 'patient' ? 'By Patient' : 'By You'}
                        </span>
                      </div>
                      {/* Show proof photo if available */}
                      {log.proofPhotoUrl && log.proofPhotoUrl.trim() !== '' && (
                        <button
                          onClick={() => {
                            console.log('🖼️ Viewing photo from activity log:', medicationName, log.timeSlot, 'URL:', log.proofPhotoUrl);
                            handleViewPhoto(
                              log.proofPhotoUrl, 
                              medicationName, 
                              log.timeSlot, 
                              logDate, 
                              takenTime, 
                              log.markedBy
                            );
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            background: '#e3f2fd',
                            border: '1px solid #2196F3',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            color: '#1976D2',
                            marginTop: '8px'
                          }}
                          title="View proof photo"
                        >
                          <FaImage /> View Proof Photo
                        </button>
                      )}
                      {/* Debug: Log if photo should be available but isn't showing */}
                      {log.status === 'taken' && !log.proofPhotoUrl && (
                        <div style={{ fontSize: '0.7rem', color: '#999', marginTop: '4px' }}>
                          (No photo)
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'calendar' && (
        <div className="card">
          <div className="card-header">
            <FaCalendar className="card-icon" />
            <h3>Medication Calendar</h3>
            <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '5px' }}>
              View patient's medication adherence calendar
            </p>
          </div>
          
          <div className="calendar-container" style={{ marginTop: '20px' }}>
            <div className="calendar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <button 
                onClick={() => navigateMonth(-1)} 
                className="calendar-nav-btn"
                style={{
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  background: '#f5f5f5',
                  cursor: 'pointer'
                }}
              >
                <FaChevronLeft />
              </button>
              <h4 style={{ margin: 0 }}>
                {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </h4>
              <button 
                onClick={() => navigateMonth(1)} 
                className="calendar-nav-btn"
                style={{
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  background: '#f5f5f5',
                  cursor: 'pointer'
                }}
              >
                <FaChevronRight />
              </button>
            </div>

            <div className="calendar-grid" style={{ marginBottom: '20px' }}>
              <div className="calendar-weekdays" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px', marginBottom: '10px' }}>
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                  <div key={day} style={{ textAlign: 'center', fontWeight: 'bold', color: '#666', padding: '8px' }}>
                    {day}
                  </div>
                ))}
              </div>
              <div className="calendar-days" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px' }}>
                {getCalendarDays().map((dayData, index) => {
                  if (dayData === null) {
                    return <div key={`empty-${index}`} style={{ aspectRatio: '1' }}></div>;
                  }
                  // Determine the class: today takes priority, then status (only for past dates and today)
                  let dayStyle = {
                    aspectRatio: '1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '8px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  };
                  
                  let titleText = '';
                  
                  if (dayData.isToday) {
                    dayStyle.background = '#3b82f6';
                    dayStyle.color = '#fff';
                    dayStyle.fontWeight = 'bold';
                    // If today has status, add it as well (but today styling takes priority)
                    if (dayData.status) {
                      // Today is blue, but we can add a subtle indicator for status
                      titleText = dayData.status === 'taken' ? 'All medications taken' : 'Some medications missed';
                    } else {
                      titleText = 'Today';
                    }
                  } else if (dayData.isPast && dayData.status) {
                    // Only show status for past dates
                    if (dayData.status === 'taken') {
                      dayStyle.background = '#10b981';
                      dayStyle.color = '#fff';
                    } else if (dayData.status === 'missed') {
                      dayStyle.background = '#ef4444';
                      dayStyle.color = '#fff';
                    }
                    titleText = dayData.status === 'taken' ? 'All medications taken' : 'Some medications missed';
                  } else if (!dayData.isPast && !dayData.isToday) {
                    // Future date - no status color, just default styling
                    dayStyle.background = '#f9fafb';
                    dayStyle.color = '#666';
                    titleText = 'Future date';
                  } else {
                    dayStyle.background = '#f9fafb';
                    dayStyle.color = '#333';
                  }
                  
                  return (
                    <div
                      key={dayData.day}
                      style={dayStyle}
                      title={titleText}
                      onMouseEnter={(e) => {
                        if (!dayData.isToday && dayData.status) {
                          e.currentTarget.style.transform = 'scale(1.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      {dayData.day}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="calendar-legend" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', paddingTop: '15px', borderTop: '1px solid #e0e0e0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#666' }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#10b981' }}></div>
                <span>All medications taken (Green)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#666' }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#ef4444' }}></div>
                <span>Some medications missed (Red)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#666' }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#3b82f6' }}></div>
                <span>Today</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <FaBell className="card-icon" />
              <h3>Notifications</h3>
              <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '5px' }}>
                Missed medication alerts and reminders
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="btn btn-secondary btn-sm"
                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
              >
                Mark All as Read
              </button>
            )}
          </div>
          
          {loadingNotifications ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div className="loading">Loading notifications...</div>
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              <FaBell style={{ fontSize: '3rem', opacity: 0.3, marginBottom: '15px' }} />
              <p>No notifications yet.</p>
              <p style={{ fontSize: '0.9rem', marginTop: '10px' }}>
                You'll receive notifications when the patient misses a medication.
              </p>
            </div>
          ) : (
            <div style={{ marginTop: '20px' }}>
              {notifications.map((notification) => {
                const createdAt = notification.createdAt?.toDate 
                  ? notification.createdAt.toDate() 
                  : new Date(notification.createdAt);
                const isToday = createdAt.toDateString() === new Date().toDateString();
                const isUnread = !notification.read;

                return (
                  <div
                    key={notification.id}
                    style={{
                      padding: '15px',
                      borderBottom: '1px solid #e0e0e0',
                      background: isUnread ? '#f0f7ff' : '#fff',
                      borderLeft: isUnread ? '4px solid #3b82f6' : '4px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onClick={() => {
                      if (isUnread) {
                        handleMarkAsRead(notification.id);
                      }
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = isUnread ? '#e0f2fe' : '#f9fafb';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isUnread ? '#f0f7ff' : '#fff';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <FaExclamationCircle style={{ color: '#ef4444', fontSize: '1.2rem' }} />
                          <div style={{ fontWeight: 'bold', fontSize: '1rem', color: isUnread ? '#1e40af' : '#333' }}>
                            {notification.message}
                          </div>
                          {isUnread && (
                            <span style={{
                              background: '#3b82f6',
                              color: '#fff',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '0.75rem',
                              fontWeight: 'bold'
                            }}>
                              New
                            </span>
                          )}
                        </div>
                        {notification.timeSlot && (
                          <div style={{ fontSize: '0.85rem', color: '#666', marginLeft: '28px', marginBottom: '4px' }}>
                            Time Slot: <strong>{notification.timeSlot}</strong>
                          </div>
                        )}
                        <div style={{ fontSize: '0.85rem', color: '#999', marginLeft: '28px' }}>
                          {isToday 
                            ? `Today at ${createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`
                            : createdAt.toLocaleString('en-US', { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric',
                                hour: '2-digit', 
                                minute: '2-digit', 
                                hour12: true 
                              })
                          }
                        </div>
                      </div>
                      {isUnread && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAsRead(notification.id);
                          }}
                          className="btn btn-sm"
                          style={{
                            padding: '4px 8px',
                            fontSize: '0.75rem',
                            background: '#e0e0e0',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                          title="Mark as read"
                        >
                          Mark Read
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Photo Modal */}
      {showPhotoModal && currentPhoto && (
        <div 
          className="modal-overlay" 
          onClick={closePhotoModal}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
        >
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              overflow: 'auto',
              position: 'relative',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
            }}
          >
            <button 
              className="modal-close-btn" 
              onClick={closePhotoModal}
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: '#f44336',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                fontWeight: 'bold'
              }}
            >
              <FaTimes />
            </button>
            <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#333' }}>
              Proof Photo - {currentPhoto.medicationName} ({currentPhoto.timeSlot})
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '15px' }}>
              Taken on {currentPhoto.date.toLocaleDateString()} at {currentPhoto.takenAt.toLocaleTimeString()} by {currentPhoto.markedBy === 'patient' ? 'Patient' : 'Caretaker'}
            </p>
            <img 
              src={currentPhoto.photoUrl} 
              alt="Proof" 
              style={{ 
                maxWidth: '100%', 
                maxHeight: '70vh', 
                objectFit: 'contain', 
                borderRadius: '8px',
                border: '1px solid #e0e0e0'
              }} 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default CaretakerDashboard;

