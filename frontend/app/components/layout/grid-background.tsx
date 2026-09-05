"use client";

export function GridBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 bg-[#181818]"
      aria-hidden="true"
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 35% 30% at 25% 45%, rgba(240,0,1,0.07) 0%, transparent 70%), radial-gradient(ellipse 35% 30% at 75% 45%, rgba(102,104,255,0.07) 0%, transparent 70%), radial-gradient(ellipse 30% 25% at 50% 10%, rgba(255,192,87,0.06) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
