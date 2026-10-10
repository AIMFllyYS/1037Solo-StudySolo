export function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '1.5px 0',
      color: accent ? 'var(--md-sys-color-primary)' : 'var(--ink-soft)',
    }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: accent ? 600 : 400 }}>{value}</span>
    </div>
  );
}