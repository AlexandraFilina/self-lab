import { t } from "@/i18n";
import type { Experiment } from "../model/types";
import { formatCount, formatNumber } from "@/lib/format";
import {
  compareMetric,
  comparisonText,
  groupObservations,
  MIN_OBSERVATIONS,
} from "../model/analytics";
import { METRICS } from "../model/metrics";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icon";

export function ResultsComparison({ experiment }: { experiment: Experiment }) {
  const groups = groupObservations(experiment.entries);
  return (
    <Card className="comparison-card">
      <div className="section-heading">
        <div>
          <h2>{t.analytics.title}</h2>
          <p className="muted">{t.analytics.description}</p>
        </div>
        <span className="neutral-badge">{t.analytics.preliminary}</span>
      </div>
      <div className="comparison-summaries">
        {experiment.metrics.map((metric) => {
          const result = compareMetric(experiment.entries, metric);
          return (
            <div key={metric}>
              <strong className="metric-name">
                <i style={{ backgroundColor: METRICS[metric].color }} />
                {METRICS[metric].label}
              </strong>
              <p>
                {comparisonText(result, METRICS[metric].label.toLocaleLowerCase(), t.analytics)}
              </p>
              {!result.enough && <small>{t.analytics.requirement(MIN_OBSERVATIONS)}</small>}
            </div>
          );
        })}
      </div>
      <details className="calculation-details">
        <summary>{t.analytics.calculation}</summary>
        <p className="muted">
          {t.analytics.groupCounts(
            groups.done.length,
            groups.notDone.length,
            groups.unclassified.length,
          )}
        </p>
        <div className="table-scroll">
          <table className="comparison-table">
            <caption className="sr-only">{t.analytics.caption}</caption>
            <thead>
              <tr>
                <th scope="col">{t.analytics.metric}</th>
                <th scope="col">{t.common.done}</th>
                <th scope="col">{t.common.notDone}</th>
                <th scope="col">{t.analytics.difference}</th>
              </tr>
            </thead>
            <tbody>
              {experiment.metrics.map((metric) => {
                const result = compareMetric(experiment.entries, metric);
                return (
                  <tr key={metric}>
                    <th scope="row">
                      <span className="metric-name">
                        <i style={{ backgroundColor: METRICS[metric].color }} />
                        {METRICS[metric].label}
                      </span>
                    </th>
                    <td>
                      <strong>
                        {result.done.average === null ? "—" : formatNumber(result.done.average)}
                      </strong>
                      <small>{formatCount(result.done.count, "observation")}</small>
                    </td>
                    <td>
                      <strong>
                        {result.notDone.average === null
                          ? "—"
                          : formatNumber(result.notDone.average)}
                      </strong>
                      <small>{formatCount(result.notDone.count, "observation")}</small>
                    </td>
                    <td>
                      <span className={result.difference === null ? "muted" : "difference"}>
                        {result.difference === null
                          ? t.analytics.noData
                          : `${result.difference > 0 ? "+" : ""}${formatCount(result.difference, "point")}`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted">{t.analytics.method}</p>
        <p className="muted">{t.analytics.missing}</p>
      </details>
      <div className="insight-note">
        <Icon name="info" />
        <p>{t.analytics.limits}</p>
      </div>
    </Card>
  );
}
