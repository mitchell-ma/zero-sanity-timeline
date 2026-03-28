/**
 * ColumnRegistry — lazy-creates EventColumn instances from status configs.
 *
 * All column behavior is derived from JSON configs (generic, operator, weapon,
 * gear, custom). The eventCategoryType determines the column class:
 *   INFLICTION / PHYSICAL_INFLICTION → InflictionColumn
 *   REACTION                         → ReactionColumn
 *   PHYSICAL_STATUS                  → PhysicalStatusColumn
 *   everything else                  → ConfigDrivenStatusColumn
 *
 * No hardcoded column ID sets — the registry reads the config for any status ID.
 */

import { EventCategoryType } from '../../../consts/enums';
import { getStatusById } from '../../gameDataStore';
import type { EventColumn, ColumnHost } from './eventColumn';
import { InflictionColumn } from './inflictionColumn';
import { ReactionColumn } from './reactionColumn';
import { PhysicalStatusColumn } from './physicalStatusColumn';
import { ConfigDrivenStatusColumn } from './configDrivenStatusColumn';

export class ColumnRegistry {
  private columns = new Map<string, EventColumn>();
  private host: ColumnHost;

  constructor(host: ColumnHost) {
    this.host = host;
  }

  /** Get or create an EventColumn for the given columnId. */
  get(columnId: string): EventColumn {
    let col = this.columns.get(columnId);
    if (col) return col;

    col = this.createColumn(columnId);
    this.columns.set(columnId, col);
    return col;
  }

  /** Clear all cached columns (called on pipeline reset). */
  clear() {
    this.columns.clear();
  }

  private createColumn(columnId: string): EventColumn {
    const config = getStatusById(columnId);
    const category = config?.eventCategoryType as string | undefined;

    switch (category) {
      case EventCategoryType.INFLICTION:
      case EventCategoryType.PHYSICAL_INFLICTION:
        return new InflictionColumn(columnId, this.host);
      case EventCategoryType.REACTION:
        return new ReactionColumn(columnId, this.host);
      case EventCategoryType.PHYSICAL_STATUS:
        return new PhysicalStatusColumn(columnId, this.host);
      default:
        return new ConfigDrivenStatusColumn(columnId, this.host);
    }
  }
}
