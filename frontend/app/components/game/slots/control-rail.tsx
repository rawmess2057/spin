import { SoundToggle } from "../../sound-toggle";

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex size-9 cursor-pointer items-center justify-center rounded-full border text-sm transition ${
        active
          ? "border-gold/60 bg-gold/15 text-gold shadow-[0_0_10px_rgba(255,192,87,0.4)]"
          : "border-border-low bg-card text-foreground hover:bg-cream"
      }`}
    >
      {children}
    </button>
  );
}

export function ControlRail({
  turbo,
  onToggleTurbo,
  onOpenPaytable,
  onOpenFairModal,
}: {
  turbo: boolean;
  onToggleTurbo: () => void;
  onOpenPaytable: () => void;
  onOpenFairModal: () => void;
}) {
  return (
    <div className="flex flex-row items-center gap-2 sm:flex-col">
      <RailButton label="Turbo mode" active={turbo} onClick={onToggleTurbo}>
        ⚡
      </RailButton>
      <SoundToggle />
      <RailButton label="Paytable" onClick={onOpenPaytable}>
        📋
      </RailButton>
      <RailButton label="Provably fair" onClick={onOpenFairModal}>
        ✓
      </RailButton>
    </div>
  );
}
