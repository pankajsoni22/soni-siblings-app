import { Link } from 'react-router-dom';
import { config } from '../../config.ts';

/** Logo mark + app name. */
export default function Brand({ to = '/', subtitle = 'Lending tracker' }: { to?: string | null; subtitle?: string }) {
  const content = (
    <>
      <span className="brand-mark" aria-hidden="true">{config.appName.slice(0, 1)}</span>
      <span className="brand-text">
        <span className="brand-name">{config.appName}</span>
        <span className="brand-sub">{subtitle}</span>
      </span>
    </>
  );
  return to === null ? <div className="brand">{content}</div> : <Link to={to} className="brand">{content}</Link>;
}
