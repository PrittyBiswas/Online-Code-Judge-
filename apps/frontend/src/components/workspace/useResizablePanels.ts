import { useState, useEffect, useRef, useCallback } from 'react';

const STORAGE_KEYS = {
  PANEL_A_WIDTH: 'judge_workspace_panel_a_width',
  PANEL_B_HEIGHT: 'judge_workspace_panel_b_height',
  PANEL_A_COLLAPSED: 'judge_workspace_panel_a_collapsed',
};

const DEFAULTS = {
  PANEL_A_WIDTH: 42, // percent
  PANEL_B_HEIGHT: 58, // percent
  MIN_PANEL_A_WIDTH: 22,
  MAX_PANEL_A_WIDTH: 65,
  MIN_PANEL_B_HEIGHT: 25,
  MAX_PANEL_B_HEIGHT: 80,
};

function readStorageNumber(key: string, fallback: number): number {
  try {
    const val = localStorage.getItem(key);
    if (val !== null) {
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0) return num;
    }
  } catch {
    // Local storage unavailable
  }
  return fallback;
}

function readStorageBool(key: string, fallback: boolean): boolean {
  try {
    const val = localStorage.getItem(key);
    if (val !== null) return val === 'true';
  } catch {
    // Local storage unavailable
  }
  return fallback;
}

function writeStorage(key: string, val: string): void {
  try {
    localStorage.setItem(key, val);
  } catch {
    // Ignore storage errors (quota/disabled)
  }
}

export function useResizablePanels(containerRef: React.RefObject<HTMLDivElement>) {
  const [panelAWidth, setPanelAWidth] = useState<number>(() =>
    readStorageNumber(STORAGE_KEYS.PANEL_A_WIDTH, DEFAULTS.PANEL_A_WIDTH)
  );
  const [panelBHeight, setPanelBHeight] = useState<number>(() =>
    readStorageNumber(STORAGE_KEYS.PANEL_B_HEIGHT, DEFAULTS.PANEL_B_HEIGHT)
  );
  const [isPanelACollapsed, setIsPanelACollapsed] = useState<boolean>(() =>
    readStorageBool(STORAGE_KEYS.PANEL_A_COLLAPSED, false)
  );
  const [isDragging, setIsDragging] = useState<'horizontal' | 'vertical' | null>(null);

  const dragTypeRef = useRef<'horizontal' | 'vertical' | null>(null);

  const startHorizontalDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    dragTypeRef.current = 'horizontal';
    setIsDragging('horizontal');
  }, []);

  const startVerticalDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    dragTypeRef.current = 'vertical';
    setIsDragging('vertical');
  }, []);

  const togglePanelACollapse = useCallback(() => {
    setIsPanelACollapsed((prev) => {
      const next = !prev;
      writeStorage(STORAGE_KEYS.PANEL_A_COLLAPSED, String(next));
      return next;
    });
  }, []);

  const handleHorizontalKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setPanelAWidth((prev) => {
        const next = Math.max(DEFAULTS.MIN_PANEL_A_WIDTH, prev - 2);
        writeStorage(STORAGE_KEYS.PANEL_A_WIDTH, String(next));
        return next;
      });
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setPanelAWidth((prev) => {
        const next = Math.min(DEFAULTS.MAX_PANEL_A_WIDTH, prev + 2);
        writeStorage(STORAGE_KEYS.PANEL_A_WIDTH, String(next));
        return next;
      });
    }
  }, []);

  const handleVerticalKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPanelBHeight((prev) => {
        const next = Math.max(DEFAULTS.MIN_PANEL_B_HEIGHT, prev - 2);
        writeStorage(STORAGE_KEYS.PANEL_B_HEIGHT, String(next));
        return next;
      });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPanelBHeight((prev) => {
        const next = Math.min(DEFAULTS.MAX_PANEL_B_HEIGHT, prev + 2);
        writeStorage(STORAGE_KEYS.PANEL_B_HEIGHT, String(next));
        return next;
      });
    }
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    function handlePointerMove(e: MouseEvent | TouchEvent) {
      if (!containerRef.current || !dragTypeRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      if (dragTypeRef.current === 'horizontal') {
        const offsetLeft = clientX - rect.left;
        const newWidthPercent = (offsetLeft / rect.width) * 100;
        const clamped = Math.max(
          DEFAULTS.MIN_PANEL_A_WIDTH,
          Math.min(DEFAULTS.MAX_PANEL_A_WIDTH, newWidthPercent)
        );
        setPanelAWidth(clamped);
        writeStorage(STORAGE_KEYS.PANEL_A_WIDTH, String(Math.round(clamped)));
      } else if (dragTypeRef.current === 'vertical') {
        const offsetTop = clientY - rect.top;
        const newHeightPercent = (offsetTop / rect.height) * 100;
        const clamped = Math.max(
          DEFAULTS.MIN_PANEL_B_HEIGHT,
          Math.min(DEFAULTS.MAX_PANEL_B_HEIGHT, newHeightPercent)
        );
        setPanelBHeight(clamped);
        writeStorage(STORAGE_KEYS.PANEL_B_HEIGHT, String(Math.round(clamped)));
      }
    }

    function handlePointerUp() {
      dragTypeRef.current = null;
      setIsDragging(null);
    }

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove);
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDragging, containerRef]);

  return {
    panelAWidth,
    panelBHeight,
    isPanelACollapsed,
    isDragging,
    startHorizontalDrag,
    startVerticalDrag,
    togglePanelACollapse,
    handleHorizontalKeyDown,
    handleVerticalKeyDown,
  };
}
