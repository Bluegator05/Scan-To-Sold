
import { supabase } from '../lib/supabaseClient';

// OPTIMIZED for speed: Default 720px width, 0.5 quality
export const compressImage = (base64Str: string, maxWidth = 720, quality = 0.5): Promise<string> => {
  return new Promise((resolve) => {
    try {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
              resolve(base64Str); // Fallback if context fails
              return;
          }
          // Use 'medium' quality for faster encoding
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(base64Str); // Fallback to original
    } catch (e) {
        console.warn("Compression error:", e);
        resolve(base64Str);
    }
  });
};

export const dataURLtoFile = (dataurl: string, filename: string): File => {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
};

export const uploadScanImage = async (userId: string, imageBase64: string): Promise<string | null> => {
    try {
        // Use optimized compression settings
        const compressed = await compressImage(imageBase64, 720, 0.5);
        const file = dataURLtoFile(compressed, `scan-${Date.now()}.jpg`);

        // Upload to 'scans' bucket
        const fileName = `${userId}/${Date.now()}.jpg`;
        const { data, error } = await supabase.storage
            .from('scans')
            .upload(fileName, file, { upsert: true });

        if (error) throw error;

        // Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from('scans')
            .getPublicUrl(fileName);

        return publicUrl;
    } catch (e) {
        // Log explicitly so we know why it failed (RLS, Network, etc)
        console.warn("Supabase Storage Upload Failed (Likely Permissions/RLS or Network). App will fallback to direct compressed upload.", e);
        return null; // Return null to trigger Base64 fallback in the app
    }
};

export const uploadMultipleImages = async (userId: string, images: string[]): Promise<string[]> => {
    const urls: string[] = [];
    for (const img of images) {
        if (img.startsWith('http')) {
            urls.push(img);
        } else {
            const url = await uploadScanImage(userId, img);
            if (url) urls.push(url);
        }
    }
    return urls;
};
