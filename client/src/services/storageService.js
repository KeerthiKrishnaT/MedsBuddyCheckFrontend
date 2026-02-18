import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';

/**
 * Upload a proof photo to Firebase Storage
 * @param {File|string} file - The file to upload (File object) or base64 data URL
 * @param {string} userId - The user ID
 * @param {string} medicationId - The medication ID
 * @param {string} timeSlot - The time slot (Morning, Afternoon, Evening, Night)
 * @returns {Promise<{url: string|null, error: string|null}>}
 */
export const uploadProofPhoto = async (file, userId, medicationId, timeSlot) => {
  try {
    if (!storage) {
      console.warn('Firebase Storage not initialized');
      // Fallback: return base64 data URL if it's already a data URL
      if (typeof file === 'string' && file.startsWith('data:')) {
        return { url: file, error: null };
      }
      return { url: null, error: 'Firebase Storage not initialized' };
    }

    if (!file) {
      return { url: null, error: 'No file provided' };
    }

    let fileToUpload;
    let fileName;

    // Handle base64 data URL (from FileReader)
    if (typeof file === 'string' && file.startsWith('data:')) {
      // Convert base64 to blob
      const response = await fetch(file);
      const blob = await response.blob();
      fileToUpload = blob;
      fileName = `proof_${userId}_${medicationId}_${timeSlot}_${Date.now()}.jpg`;
    } else if (file instanceof File || file instanceof Blob) {
      // Handle File or Blob object
      fileToUpload = file;
      fileName = `proof_${userId}_${medicationId}_${timeSlot}_${Date.now()}.${file.name?.split('.').pop() || 'jpg'}`;
    } else {
      return { url: null, error: 'Invalid file type' };
    }

    // Create a reference to the file location in Storage
    const storageRef = ref(storage, `proof-photos/${userId}/${fileName}`);

    // Upload the file
    console.log('📤 Uploading proof photo to Firebase Storage...');
    await uploadBytes(storageRef, fileToUpload);

    // Get the download URL
    const downloadURL = await getDownloadURL(storageRef);
    console.log('✅ Proof photo uploaded successfully:', downloadURL);

    return { url: downloadURL, error: null };
  } catch (error) {
    console.error('❌ Error uploading proof photo:', error);
    
    // Fallback: if upload fails but we have a base64 data URL, use it
    if (typeof file === 'string' && file.startsWith('data:')) {
      console.warn('⚠️ Using base64 fallback due to upload error');
      return { url: file, error: null };
    }
    
    return { url: null, error: error.message || 'Failed to upload photo' };
  }
};

