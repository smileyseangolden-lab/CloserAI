import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 text-sm',
        className,
      )}
    >
      <div className="text-text-muted">
        {total === 0 ? (
          'No results'
        ) : (
          <>
            Showing <span className="font-medium text-text-primary">{start}</span>–
            <span className="font-medium text-text-primary">{end}</span> of{' '}
            <span className="font-medium text-text-primary">{total.toLocaleString()}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-text-muted">
            <span className="hidden sm:inline">Rows per page</span>
            <select
              className="rounded-md border border-border-default bg-surface text-text-primary px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={!canPrev}
          className="inline-flex items-center gap-1 rounded-md border border-border-default px-2.5 py-1.5 text-sm text-text-secondary hover:bg-surface-muted disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Previous page"
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <span className="px-2 text-text-muted">
          Page <span className="text-text-primary font-medium">{safePage}</span> of{' '}
          <span className="text-text-primary font-medium">{totalPages}</span>
        </span>
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={!canNext}
          className="inline-flex items-center gap-1 rounded-md border border-border-default px-2.5 py-1.5 text-sm text-text-secondary hover:bg-surface-muted disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Next page"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
