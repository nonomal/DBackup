"use client";

import { useRef, useState, useEffect } from "react";
import type { ReactNode } from "react";

interface DashboardBottomGridProps {
  left: ReactNode;
  right: ReactNode;
}

export function DashboardBottomGrid({ left, right }: DashboardBottomGridProps) {
  const rightRef = useRef<HTMLDivElement>(null);
  const [leftHeight, setLeftHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = rightRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setLeftHeight(el.offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
      <div
        className="col-span-full lg:col-span-4"
        style={leftHeight ? { height: `${leftHeight}px` } : undefined}
      >
        {left}
      </div>
      <div className="col-span-full lg:col-span-3 flex flex-col gap-4 lg:self-start" ref={rightRef}>
        {right}
      </div>
    </div>
  );
}
