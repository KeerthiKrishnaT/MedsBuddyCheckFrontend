import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';

export const uploadProofPhoto = async (file, userId, medicationId, timeSlot) => {
  try {
    if (!storage) {
      console.warn('Firebase Storage not initialized');
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

    if (typeof file === 'string' && file.startsWith('data:')) {
      const response = await fetch(file);
      const blob = await response.blob();
      fileToUpload = blob;
      fileName = `proof_${userId}_${medicationId}_${timeSlot}_${Date.now()}.jpg`;
    } else if (file instanceof File || file instanceof Blob) {
      fileToUpload = file;
      fileName = `proof_${userId}_${medicationId}_${timeSlot}_${Date.now()}.${file.name?.split('.').pop() || 'jpg'}`;
    } else {
      return { url: null, error: 'Invalid file type' };
    }

    const storageRef = ref(storage, `proof-photos/${userId}/${fileName}`);

    console.log('📤 Uploading proof photo to Firebase Storage...');
    await uploadBytes(storageRef, fileToUpload);

    const downloadURL = await getDownloadURL(storageRef);
    console.log('✅ Proof photo uploaded successfully:', downloadURL);

    return { url: downloadURL, error: null };
  } catch (error) {
    console.error('❌ Error uploading proof photo:', error);
    
    if (typeof file === 'string' && file.startsWith('data:')) {
      console.warn('⚠️ Using base64 fallback due to upload error');
      return { url: file, error: null };
    }
    
    return { url: null, error: error.message || 'Failed to upload photo' };
  }
};

