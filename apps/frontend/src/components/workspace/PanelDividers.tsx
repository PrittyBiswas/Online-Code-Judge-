import React from 'react';
import { GripVertical, GripHorizontal } from 'lucide-react';

interface HorizontalSplitterProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isDragging: boolean;
}

export function HorizontalSplitter({
  onMouseDown,
  onTouchStart,
  onKeyDown,
  isDragging,
}: HorizontalSplitterProps) {
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label="Resize problem description panel"
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onKeyDown={onKeyDown}
      className={`group relative hidden lg:flex w-2 cursor-col-resize select-none items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/70 ${
        isDragging ? 'bg-indigo-600' : 'bg-slate-800 hover:bg-indigo-500/40'
      }`}
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
      <GripVertical className="h-4 w-4 text-slate-500 transition-colors group-hover:text-indigo-300" />
    </div>
  );
}

interface VerticalSplitterProps {
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isDragging: boolean;
}

export function VerticalSplitter({
  onMouseDown,
  onTouchStart,
  onKeyDown,
  isDragging,
}: VerticalSplitterProps) {
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="horizontal"
      aria-label="Resize editor and results panels"
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onKeyDown={onKeyDown}
      className={`group relative flex h-2 cursor-row-resize select-none items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/70 ${
        isDragging ? 'bg-indigo-600' : 'bg-slate-800 hover:bg-indigo-500/40'
      }`}
    >
      <div className="absolute -top-1 -bottom-1 inset-x-0" />
      <GripHorizontal className="h-4 w-4 text-slate-500 transition-colors group-hover:text-indigo-300" />
    </div>
  );
}
