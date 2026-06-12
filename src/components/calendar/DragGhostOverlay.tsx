/**
 * DragGhostOverlay — floating indicator that follows touch/pointer during drag.
 * Shows the dragged item name and provides visual feedback.
 */
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";

interface DragGhostOverlayProps {
  visible: boolean;
  x: number;
  y: number;
  label: string;
  className?: string;
}

export function DragGhostOverlay({ visible, x, y, label, className }: DragGhostOverlayProps) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed z-[9999] pointer-events-none transition-transform",
        "flex items-center gap-1.5 rounded-lg border border-primary/40 bg-card px-3 py-2 shadow-xl",
        "text-xs font-medium text-foreground",
        "animate-in zoom-in-90 duration-150",
        className
      )}
      style={{
        left: x - 60,
        top: y - 20,
        maxWidth: 200,
      }}
    >
      <GripVertical className="h-3.5 w-3.5 text-primary shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}
