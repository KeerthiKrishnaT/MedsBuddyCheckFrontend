import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getMedications, addMedication, deleteMedication } from '../../services/medicationService';
import { toast } from 'react-toastify';
import { FaPlus, FaTimes, FaPills } from 'react-icons/fa';

const MedicationList = () => {
  const { user } = useAuth();
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    dosage: '',
    frequency: '',
    timeSlots: ['Morning'], // Array of selected time slots
    foodTiming: 'after', // 'before' or 'after'
    notes: ''
  });

  useEffect(() => {
    if (user) {
      loadMedications();
    }
  }, [user]);

  const loadMedications = async () => {
    try {
      const { medications: meds, error } = await getMedications(user.uid);
      if (error) {
        toast.error('Failed to load medications');
        return;
      }
      setMedications(meds);
    } catch (error) {
      toast.error('Failed to load medications');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (submitting) {
      return; // Prevent double submission
    }

    if (!user || !user.uid) {
      toast.error('Please log in to add medications');
      return;
    }

    if (!formData.name || !formData.name.trim()) {
      toast.error('Please enter medication name');
      return;
    }

    if (!formData.dosage || !formData.dosage.trim()) {
      toast.error('Please enter dosage');
      return;
    }

    if (!formData.frequency || !formData.frequency.trim()) {
      toast.error('Please enter frequency');
      return;
    }

    if (formData.timeSlots.length === 0) {
      toast.error('Please select at least one time slot');
      return;
    }

    setSubmitting(true);

    try {
      console.log('Adding medication with data:', {
        userId: user.uid,
        medicationData: formData
      });

      const { id, error } = await addMedication(user.uid, {
        name: formData.name.trim(),
        dosage: formData.dosage.trim(),
        frequency: formData.frequency.trim(),
        timeSlots: formData.timeSlots,
        foodTiming: formData.foodTiming,
        notes: formData.notes.trim()
      });

      if (error) {
        console.error('Error adding medication:', error);
        
        let errorMsg = error;
        if (error.includes('Connection test timeout') || error.includes('Cannot connect to Firestore')) {
          errorMsg = 'Firestore connection failed. This usually means:\n\n' +
            '1. Firestore is not enabled in Firebase Console\n' +
            '2. Security rules are blocking all access\n' +
            '3. Internet connection issues\n\n' +
            'See ENABLE_FIRESTORE.md for step-by-step instructions.';
        } else if (error.includes('timeout') || error.includes('timed out')) {
          errorMsg = 'Request timed out. This usually means:\n\n' +
            '• Firestore security rules are blocking writes\n' +
            '• Firestore is not enabled in Firebase Console\n' +
            '• Internet connection is slow\n\n' +
            'See ENABLE_FIRESTORE.md and FIREBASE_SECURITY_RULES.md for help.';
        }
        
        toast.error(errorMsg, {
          autoClose: 8000,
          style: { whiteSpace: 'pre-line', maxWidth: '500px' }
        });
        setSubmitting(false);
        return;
      }

      if (!id) {
        console.error('No ID returned from addMedication');
        toast.error('Failed to add medication: No ID returned');
        setSubmitting(false);
        return;
      }

      console.log('Medication added successfully with ID:', id);
      
      const newMedication = {
        id,
        ...formData,
        userId: user.uid,
        createdAt: new Date(),
        isActive: true
      };
      setMedications(prev => [newMedication, ...prev]);
      
      setShowAddForm(false);
      setFormData({ 
        name: '', 
        dosage: '', 
        frequency: '', 
        timeSlots: ['Morning'],
        foodTiming: 'after',
        notes: ''
      });
      
      loadMedications().catch(err => {
        console.error('Background reload failed:', err);
      });
      
      toast.success('Medication added successfully');
    } catch (error) {
      console.error('Exception in handleSubmit:', error);
      const errorMessage = error.message || error.toString();
      
      let userMessage = '';
      if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        userMessage = 'Request timed out. This usually means:\n• Firestore security rules are blocking writes\n• Internet connection is slow\n• Firebase project is not properly configured\n\nPlease check FIREBASE_SECURITY_RULES.md for help.';
      } else if (errorMessage.includes('network')) {
        userMessage = 'Network error. Please check your internet connection.';
      } else if (errorMessage.includes('permission')) {
        userMessage = 'Permission denied. Please update your Firestore security rules. See FIREBASE_SECURITY_RULES.md for help.';
      } else {
        userMessage = `Failed to add medication: ${errorMessage}`;
      }
      
      toast.error(userMessage, {
        autoClose: 7000,
        style: { whiteSpace: 'pre-line' }
      });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTimeSlot = (slot) => {
    setFormData(prev => ({
      ...prev,
      timeSlots: prev.timeSlots.includes(slot)
        ? prev.timeSlots.filter(s => s !== slot)
        : [...prev.timeSlots, slot]
    }));
  };

  const handleDelete = async (medicationId) => {
    if (!window.confirm('Are you sure you want to delete this medication?')) {
      return;
    }

    try {
      const { error } = await deleteMedication(medicationId);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('Medication deleted successfully');
      loadMedications();
    } catch (error) {
      toast.error('Failed to delete medication');
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="medication-list-page">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>
            <FaPills /> Medication List (Caretaker View)
          </h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="btn btn-primary"
          >
            <FaPlus /> Add Medication
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleSubmit} style={{ marginTop: '20px', padding: '20px', background: '#f9f9f9', borderRadius: '8px' }}>
            <div className="form-group">
              <label>Medication Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="form-control"
                placeholder="e.g., Aspirin"
                required
              />
            </div>
            <div className="form-group">
              <label>Dosage</label>
              <input
                type="text"
                value={formData.dosage}
                onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
                className="form-control"
                placeholder="e.g., 500mg"
                required
              />
            </div>
            <div className="form-group">
              <label>Frequency</label>
              <input
                type="text"
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                className="form-control"
                placeholder="e.g., Twice daily"
                required
              />
            </div>
            <div className="form-group">
              <label>Time Slots (Select all that apply)</label>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
                {['Morning', 'Afternoon', 'Evening', 'Night'].map(slot => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => toggleTimeSlot(slot)}
                    style={{
                      padding: '8px 16px',
                      border: `2px solid ${formData.timeSlots.includes(slot) ? '#4CAF50' : '#ddd'}`,
                      background: formData.timeSlots.includes(slot) ? '#4CAF50' : '#fff',
                      color: formData.timeSlots.includes(slot) ? '#fff' : '#333',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: formData.timeSlots.includes(slot) ? 'bold' : 'normal'
                    }}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>Food Timing</label>
              <select
                value={formData.foodTiming}
                onChange={(e) => setFormData({ ...formData, foodTiming: e.target.value })}
                className="form-control"
                required
              >
                <option value="before">Before Food</option>
                <option value="after">After Food</option>
                <option value="with">With Food</option>
                <option value="empty">Empty Stomach</option>
              </select>
            </div>
            <div className="form-group">
              <label>Notes (Optional)</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="form-control"
                rows="3"
                placeholder="Additional instructions or notes..."
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={submitting}
                style={{ opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
              >
                {submitting ? 'Adding...' : 'Add Medication'}
              </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setFormData({ 
                      name: '', 
                      dosage: '', 
                      frequency: '', 
                      timeSlots: ['Morning'],
                      foodTiming: 'after',
                      notes: ''
                    });
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
            </div>
          </form>
        )}

        {medications.length === 0 ? (
          <p style={{ marginTop: '20px', color: '#666', textAlign: 'center' }}>
            No medications added yet. Add a medication to get started.
          </p>
        ) : (
          <div className="medication-list" style={{ marginTop: '20px' }}>
            {medications.map((med) => (
              <div key={med.id} className="medication-item-card">
                <div className="medication-info">
                  <h4>{med.name}</h4>
                  <p><strong>Dosage:</strong> {med.dosage}</p>
                  <p><strong>Frequency:</strong> {med.frequency}</p>
                  {med.timeSlots && med.timeSlots.length > 0 && (
                    <p><strong>Time Slots:</strong> {med.timeSlots.join(', ')}</p>
                  )}
                  {med.foodTiming && (
                    <p><strong>Food Timing:</strong> {med.foodTiming.charAt(0).toUpperCase() + med.foodTiming.slice(1)} Food</p>
                  )}
                  {med.notes && (
                    <p><strong>Notes:</strong> {med.notes}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(med.id)}
                  className="btn btn-danger btn-sm"
                >
                  <FaTimes /> Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MedicationList;

