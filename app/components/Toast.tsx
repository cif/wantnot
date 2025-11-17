import { useEffect } from "react";
import { X } from "lucide-react";

interface ToastProps {
  message: string;
  type: "success" | "error";
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 3500 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in-from-top">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border ${
          type === "success"
            ? "bg-green-50 border-green-200 text-green-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}
      >
        <span className="text-sm font-medium">{message}</span>
        <button
          onClick={onClose}
          className={`p-1 rounded hover:bg-opacity-20 transition-colors ${
            type === "success" ? "hover:bg-green-800" : "hover:bg-red-800"
          }`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
