import { t } from "@/i18n";
import type { Experiment } from "../model/types";
import { formatCount, formatNumber, formatRelativePercent } from "@/lib/format";
import {
  compareMetric,
  comparisonText,
  getResultDirection,
  getResultsEnding,
  groupObservations,
  MIN_OBSERVATIONS,
  observedWindowDays,
} from "../model/analytics";
import { metricLabel, metricColor } from "../model/metrics";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icon";

export function ResultsComparison({
  experiment,
  completed = false,
}: {
  experiment: Experiment;
  completed?: boolean;
}) {
  const groups = groupObservations(experiment.entries);
  const comparisons = experiment.metrics.map((metric) => ({
    metric,
    result: compareMetric(experiment.entries, metric.id, metric.scale),
  }));
  const ending = getResultsEnding(comparisons.map((item) => item.result));
  return (
    <Card id="results" className="comparison-card">
      <div className="section-heading">
        <div>
          <h2>{t.analytics.title}</h2>
          <p className="muted">{t.analytics.description}</p>
        </div>
        <span className="neutral-badge">
          {experiment.source === "sample" ? t.common.sample : t.analytics.preliminary}
        </span>
      </div>
      <div className="metric-results">
        {comparisons.map(({ metric, result }) => {
          const label = metricLabel(metric);
          const narrativeLabel = metric.kind === "built_in" ? label.toLocaleLowerCase() : label;
          const direction = getResultDirection(result);
          return (
            <article className="metric-result" key={metric.id} data-metric-id={metric.id}>
              <div className="section-heading">
                <h3 className="metric-name">
                  <i style={{ backgroundColor: metricColor(metric) }} />
                  {label}
                </h3>
                <span className="neutral-badge data-strength">
                  {t.analytics.strength[result.strength]}
                </span>
              </div>
              {!result.enough ? (
                <p className="result-message">{t.analytics.insufficient}</p>
              ) : result.conclusion === "similar" ? (
                <>
                  <p className="result-message">{t.analytics.noClearDifference}</p>
                  {result.relativeDifference !== null && (
                    <p className="muted result-relative-small">
                      {t.analytics.difference}: {formatRelativePercent(result.relativeDifference)}
                    </p>
                  )}
                </>
              ) : result.relativeDifference === null ? (
                <p className="result-message">{t.analytics.relativeUnavailable}</p>
              ) : (
                <>
                  <p className="result-percentage">
                    {formatRelativePercent(result.relativeDifference)}
                  </p>
                  <p className="result-direction">{t.analytics.direction[direction]}</p>
                </>
              )}
              <p className="result-counts">
                {t.analytics.metricCounts(result.done.count, result.notDone.count)}
              </p>
              {result.enough && (
                <p className="result-interpretation">
                  {comparisonText(result, narrativeLabel, t.analytics)}
                </p>
              )}
              {result.enough &&
                result.relativeDifference !== null &&
                (result.conclusion === "higher" || result.conclusion === "lower") && (
                  <p className="field-hint">
                    {t.analytics.relativeSummary(
                      narrativeLabel,
                      formatRelativePercent(Math.abs(result.relativeDifference), false),
                      result.conclusion,
                    )}
                  </p>
                )}
              {!result.enough && (
                <p className="field-hint">{t.analytics.requirement(MIN_OBSERVATIONS)}</p>
              )}
            </article>
          );
        })}
      </div>
      <div className="insight-note">
        <Icon name="info" />
        <p>{t.analytics.causalLimit}</p>
      </div>
      <p className="results-ending">{t.analytics.endings[ending]}</p>
      <details className="calculation-details">
        <summary>{t.analytics.calculation}</summary>
        <p className="muted">
          {t.analytics.metricCounts(groups.done.length, groups.notDone.length)}
        </p>
        {completed && (
          <p className="muted">
            {t.analytics.missingDays(
              Math.max(0, observedWindowDays(experiment) - experiment.entries.length),
            )}
          </p>
        )}
        {groups.unclassified.length > 0 && (
          <p className="muted">{t.analytics.excluded(groups.unclassified.length)}</p>
        )}
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
              {comparisons.map(({ metric, result }) => (
                <tr key={metric.id}>
                  <th scope="row">
                    <span className="metric-name">
                      <i style={{ backgroundColor: metricColor(metric) }} />
                      {metricLabel(metric)}
                    </span>
                  </th>
                  <td>
                    <strong>
                      {result.done.average === null
                        ? "—"
                        : `${formatNumber(result.done.average)} / ${metric.scale.max}`}
                    </strong>
                    <small>{formatCount(result.done.count, "observation")}</small>
                    <small>{t.analytics.missingScores(result.missingScores.done)}</small>
                  </td>
                  <td>
                    <strong>
                      {result.notDone.average === null
                        ? "—"
                        : `${formatNumber(result.notDone.average)} / ${metric.scale.max}`}
                    </strong>
                    <small>{formatCount(result.notDone.count, "observation")}</small>
                    <small>{t.analytics.missingScores(result.missingScores.notDone)}</small>
                  </td>
                  <td>
                    {!result.enough ? (
                      <span className="muted">{t.analytics.noPercentYet}</span>
                    ) : result.relativeDifference === null ? (
                      <span className="muted">{t.analytics.invalidDenominator}</span>
                    ) : (
                      <span className="difference">
                        {formatRelativePercent(result.relativeDifference)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">{t.analytics.method}</p>
        <p className="muted">{t.analytics.strengthHelp}</p>
        <p className="muted">{t.analytics.missing}</p>
        <p className="muted">{t.analytics.limits}</p>
      </details>
    </Card>
  );
}
