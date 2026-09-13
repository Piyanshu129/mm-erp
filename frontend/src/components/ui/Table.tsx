export function Table({ children, minWidth = 500 }: { children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`bg-gray-50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`border-t border-gray-100 px-4 py-3 text-gray-700 ${className}`}>{children}</td>;
}

export function Tr({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <tr className={`hover:bg-gray-50 ${className}`}>{children}</tr>;
}
