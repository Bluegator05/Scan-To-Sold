
import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { X, Check, ZoomIn, ZoomOut, CheckCircle, RotateCcw } from 'lucide-react';

interface CropModalProps {
    isOpen: boolean;
    image: string;
    onClose: () => void;
    onSave: (croppedImage: string) => void;
}

const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => resolve(image));
        image.addEventListener('error', (error) => reject(error));
        image.setAttribute('crossOrigin', 'anonymous');
        image.src = url;
    });

const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<string | null> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        return null;
    }

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
    );

    return canvas.toDataURL('image/jpeg', 0.9);
};

const CropModal: React.FC<CropModalProps> = ({ isOpen, image, onClose, onSave }) => {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [aspect, setAspect] = useState<number | undefined>(4 / 3);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ x: number, y: number, width: number, height: number } | null>(null);

    const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleSave = async () => {
        if (!croppedAreaPixels) return;
        try {
            const croppedImage = await getCroppedImg(image, croppedAreaPixels);
            if (croppedImage) {
                onSave(croppedImage);
                onClose();
            }
        } catch (e) {
            console.error(e);
            alert("Failed to crop image.");
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/95">
            <div className="relative w-full h-full flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-4 bg-black border-b border-gray-800 z-10">
                    <h3 className="text-white font-bold text-lg">Crop Image</h3>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-full bg-gray-900 border border-gray-700">
                        <X size={24} />
                    </button>
                </div>

                {/* Cropper Area */}
                <div className="flex-1 relative bg-black">
                    <Cropper
                        image={image}
                        crop={crop}
                        zoom={zoom}
                        aspect={aspect}
                        onCropChange={setCrop}
                        onCropComplete={onCropComplete}
                        onZoomChange={setZoom}
                        objectFit="contain"
                        restrictPosition={false}
                    />
                </div>

                {/* Controls */}
                <div className="p-6 bg-slate-900 border-t border-slate-800 safe-pb">
                    <div className="max-w-md mx-auto w-full space-y-4">
                        {/* Aspect Ratio Selector */}
                        <div className="flex justify-between gap-2 overflow-x-auto pb-2">
                            {[
                                { label: 'Free', value: undefined },
                                { label: 'Square', value: 1 },
                                { label: '4:3', value: 4 / 3 },
                                { label: '16:9', value: 16 / 9 },
                                { label: '3:4', value: 3 / 4 },
                            ].map((ratio) => (
                                <button
                                    key={ratio.label}
                                    onClick={() => setAspect(ratio.value)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${(aspect === ratio.value)
                                        ? 'bg-neon-green text-slate-900 border border-neon-green'
                                        : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-white'
                                        }`}
                                >
                                    {ratio.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-4">
                            <ZoomOut size={20} className="text-gray-400" />
                            <input
                                type="range"
                                value={zoom}
                                min={1}
                                max={3}
                                step={0.1}
                                aria-labelledby="Zoom"
                                onChange={(e) => setZoom(Number(e.target.value))}
                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-neon-green"
                            />
                            <ZoomIn size={20} className="text-gray-400" />
                        </div>

                        <div className="flex gap-4 pt-2">
                            <div className="flex gap-2">
                                <button onClick={() => {
                                    setCrop({ x: 0, y: 0 });
                                    setZoom(1);
                                    setAspect(4 / 3);
                                }} className="px-4 py-3 text-white font-bold bg-slate-800 rounded-xl border border-slate-700 hover:bg-slate-700 flex items-center gap-2">
                                    <RotateCcw size={18} /> Reset
                                </button>
                                <button onClick={onClose} className="flex-1 py-3 text-white font-bold bg-slate-800 rounded-xl border border-slate-700 hover:bg-slate-700">
                                    Cancel
                                </button>
                            </div>
                            <button onClick={handleSave} className="flex-1 py-3 text-slate-900 font-bold bg-neon-green rounded-xl hover:bg-neon-green/90 flex items-center justify-center gap-2">
                                <CheckCircle size={20} /> Save Crop
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CropModal;
