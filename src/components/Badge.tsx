import { companyById, type CompanyId } from '../../shared/model';

export function CompanyBadge({
  company,
  withDot = true,
}: {
  company: CompanyId;
  withDot?: boolean;
}) {
  const meta = companyById(company);
  return (
    <span
      className="company-badge"
      style={{
        color: meta.accent,
        borderColor: `color-mix(in srgb, ${meta.accent} 30%, transparent)`,
        background: `color-mix(in srgb, ${meta.accent} 10%, transparent)`,
      }}
    >
      {withDot ? <span className="company-badge__dot" style={{ background: meta.accent }} /> : null}
      {meta.name}
    </span>
  );
}
