import React, { useRef, useState } from 'react';
import { Camera, Upload } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (base64: string) => void;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix for API
      const base64Content = base64String.split(',')[1];
      onCapture(base64Content);
    };
    reader.readAsDataURL(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div 
      className={`relative w-full h-64 border border-dashed rounded-3xl flex flex-col items-center justify-center transition-all cursor-pointer group
        ${dragActive ? 'border-[#1d9bf0] bg-[#1d9bf0]/10' : 'border-[#2f3336] hover:border-[#1d9bf0] hover:bg-[#1d9bf0]/5'}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
      />
      
      <div className="w-16 h-16 bg-[#1d9bf0]/10 text-[#1d9bf0] rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
        <Camera size={32} />
      </div>
      
      <h3 className="text-lg font-bold text-[#e7e9ea]">Snap or Drop Photo</h3>
      <p className="text-sm text-[#71767b] mt-2 text-center max-w-xs">
        Take a clear picture of your item to instantly analyze comps.
      </p>
      
      <div className="absolute bottom-4 right-4 bg-black p-2 rounded-full border border-[#2f3336]">
        <Upload size={16} className="text-[#1d9bf0]" />
      </div>
    </div>
  );
};

export default CameraCapture;