import { READINESS_TEXT, type ReadinessItem } from './readiness.ts';

export function ReadinessList({ items }: { items: ReadinessItem[] }) {
  return <ul className="readiness-list" aria-label="Demonstration readiness">{items.map(item => <li key={item.id}><span>{item.label}</span><span className={`level level-${item.level}`}>{READINESS_TEXT[item.level]}</span></li>)}</ul>;
}
