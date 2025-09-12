export default function AdminCard({ id, title, description, children, actions = null }) {
  return (
    <section id={id} className="rounded-2xl bg-white shadow">
      <div className="flex items-start justify-between gap-4 border-b p-4">
        <div className="flex items-center gap-3">
          <div className="h-6 w-1.5 rounded bg-blue-600" />
          <div>
            <h2 className="text-lg font-semibold text-blue-700">{title}</h2>
            {description && <p className="text-sm text-gray-600">{description}</p>}
          </div>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
