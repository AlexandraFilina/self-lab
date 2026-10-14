"use client";

import { useExperiments } from "@/features/experiments/context/experiments-provider";
import type { Experiment } from "@/features/experiments/model/types";
import { formatCount, formatNumber } from "@/lib/format";
import { getProgress, metricSummary } from "@/features/experiments/model/analytics";
import { METRICS } from "@/features/experiments/model/metrics";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icon";

export function ResultsComparison({ experiment }: { experiment: Experiment }) {
  const { referenceDate } = useExperiments();
  const { completed } = getProgress(experiment, referenceDate);
  return (
    <Card className="comparison-card">
      <div className="section-heading">
        <div>
          <h2>What the observations show</h2>
          <p className="muted">Average scores by period · scale of 1 to 10</p>
        </div>
        <span className="neutral-badge">{completed ? "Demo results" : "Preliminary"}</span>
      </div>
      <div className="table-scroll">
        <table className="comparison-table">
          <caption className="sr-only">Comparison of A and B averages and sample sizes</caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Period A</th>
              <th scope="col">Period B</th>
              <th scope="col">Difference B − A</th>
            </tr>
          </thead>
          <tbody>
            {experiment.metrics.map((metric) => {
              const a = metricSummary(experiment, metric, "A"),
                b = metricSummary(experiment, metric, "B");
              const difference =
                a.average !== null && b.average !== null ? b.average - a.average : null;
              return (
                <tr key={metric}>
                  <th scope="row">
                    <span className="metric-name">
                      <i style={{ backgroundColor: METRICS[metric].color }} />
                      {METRICS[metric].label}
                    </span>
                  </th>
                  <td>
                    <strong>{a.average === null ? "—" : formatNumber(a.average)}</strong>
                    <small>{formatCount(a.count, "entry", "entries")}</small>
                  </td>
                  <td>
                    <strong>{b.average === null ? "—" : formatNumber(b.average)}</strong>
                    <small>{formatCount(b.count, "entry", "entries")}</small>
                  </td>
                  <td>
                    <span className={difference === null ? "muted" : "difference"}>
                      {difference === null
                        ? "No data yet"
                        : `${difference > 0 ? "+" : ""}${formatCount(difference, "point")}`}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="insight-note">
        <Icon name="info" />
        <p>
          {!completed && "This experiment is still running; averages may change. "}The difference
          describes these entries. It does not show that changing your habit caused it. Workload,
          weekends, and other circumstances may have influenced your scores.
        </p>
      </div>
    </Card>
  );
}
