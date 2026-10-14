import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <p className="eyebrow">404</p>
      <h1>Nothing here yet</h1>
      <p>Head back to your dashboard and keep exploring.</p>
      <Link href="/dashboard" className="button button-primary">
        Back to dashboard
      </Link>
    </div>
  );
}
