/**
 * Enemy registry — maps view-layer enemy IDs to model enemy instances.
 *
 * The view layer uses lightweight Enemy objects (id + name + tier).
 * The controller layer needs model Enemy instances (with DEF, resistances, etc.)
 * for damage calculation.
 */
import { Enemy as ModelEnemy } from '../../model/enemies/enemy';

// ── Concrete enemy imports ─────────────────────────────────────────────────
import { RhodagnEnemy } from '../../model/enemies/landbreakers/rhodagnEnemy';
import { TriaggelosEnemy } from '../../model/enemies/aggeloi/triaggelosEnemy';
import { MarbleAggelomoiraiPalecoreEnemy } from '../../model/enemies/aggeloi/marbleAggelomoiraiPalecoreEnemy';
import { MarbleAggelomoiraiPalesentEnemy } from '../../model/enemies/aggeloi/marbleAggelomoiraiPalesentEnemy';
import { MarbleAppendageEnemy } from '../../model/enemies/aggeloi/marbleAppendageEnemy';
import { RamEnemy } from '../../model/enemies/aggeloi/ramEnemy';
import { RamAlphaEnemy } from '../../model/enemies/aggeloi/ramAlphaEnemy';
import { StingEnemy } from '../../model/enemies/aggeloi/stingEnemy';
import { StingAlphaEnemy } from '../../model/enemies/aggeloi/stingAlphaEnemy';
import { FalsewingsEnemy } from '../../model/enemies/aggeloi/falsewingsEnemy';
import { FalsewingsAlphaEnemy } from '../../model/enemies/aggeloi/falsewingsAlphaEnemy';
import { MudflowEnemy } from '../../model/enemies/aggeloi/mudflowEnemy';
import { MudflowDeltaEnemy } from '../../model/enemies/aggeloi/mudflowDeltaEnemy';
import { HedronEnemy } from '../../model/enemies/aggeloi/hedronEnemy';
import { HedronDeltaEnemy } from '../../model/enemies/aggeloi/hedronDeltaEnemy';
import { PrismEnemy } from '../../model/enemies/aggeloi/prismEnemy';
import { HeavyRamEnemy } from '../../model/enemies/aggeloi/heavyRamEnemy';
import { HeavyRamAlphaEnemy } from '../../model/enemies/aggeloi/heavyRamAlphaEnemy';
import { HeavyStingEnemy } from '../../model/enemies/aggeloi/heavyStingEnemy';
import { HeavyStingAlphaEnemy } from '../../model/enemies/aggeloi/heavyStingAlphaEnemy';
import { EffigyEnemy } from '../../model/enemies/aggeloi/effigyEnemy';
import { SentinelEnemy } from '../../model/enemies/aggeloi/sentinelEnemy';
import { TidewalkerEnemy } from '../../model/enemies/aggeloi/tidewalkerEnemy';
import { TidewalkerDeltaEnemy } from '../../model/enemies/aggeloi/tidewalkerDeltaEnemy';
import { WalkingChrysopolisEnemy } from '../../model/enemies/aggeloi/walkingChrysopolisEnemy';
import { TidalklastEnemy } from '../../model/enemies/aggeloi/tidalklastEnemy';
import { BonekrusherRipptuskEnemy } from '../../model/enemies/landbreakers/bonekrusherRipptuskEnemy';
import { EliteRipptuskEnemy } from '../../model/enemies/landbreakers/eliteRipptuskEnemy';
import { HazefyreTuskbeastEnemy } from '../../model/enemies/landbreakers/hazefyreTuskbeastEnemy';
import { HazefyreClawEnemy } from '../../model/enemies/landbreakers/hazefyreClawEnemy';
import { BonekrusherRaiderEnemy } from '../../model/enemies/landbreakers/bonekrusherRaiderEnemy';
import { EliteRaiderEnemy } from '../../model/enemies/landbreakers/eliteRaiderEnemy';
import { BonekrusherAmbusherEnemy } from '../../model/enemies/landbreakers/bonekrusherAmbusherEnemy';
import { EliteAmbusherEnemy } from '../../model/enemies/landbreakers/eliteAmbusherEnemy';
import { BonekrusherInfiltratorEnemy } from '../../model/enemies/landbreakers/bonekrusherInfiltratorEnemy';
import { BonekrusherVanguardEnemy } from '../../model/enemies/landbreakers/bonekrusherVanguardEnemy';
import { BonekrusherPyromancerEnemy } from '../../model/enemies/landbreakers/bonekrusherPyromancerEnemy';
import { BonekrusherArsonistEnemy } from '../../model/enemies/landbreakers/bonekrusherArsonistEnemy';
import { BonekrusherBallistaEnemy } from '../../model/enemies/landbreakers/bonekrusherBallistaEnemy';
import { BonekrusherExecutionerEnemy } from '../../model/enemies/landbreakers/bonekrusherExecutionerEnemy';
import { EliteExecutionerEnemy } from '../../model/enemies/landbreakers/eliteExecutionerEnemy';
import { BonekrusherSiegeknucklesEnemy } from '../../model/enemies/landbreakers/bonekrusherSiegeknucklesEnemy';
import { AcidOriginiumSlugEnemy } from '../../model/enemies/wildlife/acidOriginiumSlugEnemy';
import { BlazemistOriginiumSlugEnemy } from '../../model/enemies/wildlife/blazemistOriginiumSlugEnemy';
import { FiremistOriginiumSlugEnemy } from '../../model/enemies/wildlife/firemistOriginiumSlugEnemy';
import { BrutalPincerbeastEnemy } from '../../model/enemies/wildlife/brutalPincerbeastEnemy';
import { IndigenousPincerbeastEnemy } from '../../model/enemies/wildlife/indigenousPincerbeastEnemy';
import { WaterlampEnemy } from '../../model/enemies/wildlife/waterlampEnemy';
import { ImbuedQuillbeastEnemy } from '../../model/enemies/wildlife/imbuedQuillbeastEnemy';
import { QuillbeastEnemy } from '../../model/enemies/wildlife/quillbeastEnemy';
import { TunnelingNidwyrmEnemy } from '../../model/enemies/wildlife/tunnelingNidwyrmEnemy';
import { AxeArmorbeastEnemy } from '../../model/enemies/wildlife/axeArmorbeastEnemy';
import { HazefyreAxeArmorbeastEnemy } from '../../model/enemies/wildlife/hazeyfyreAxeArmorbeastEnemy';
import { GlaringRakerbeastEnemy } from '../../model/enemies/wildlife/glaringRakerbeastEnemy';
import { SpottedRakerbeastEnemy } from '../../model/enemies/wildlife/spottedRakerbeastEnemy';
import { GroveArcherEnemy } from '../../model/enemies/cangzei-pirates/groveArcherEnemy';
import { RoadPlundererEnemy } from '../../model/enemies/cangzei-pirates/roadPlundererEnemy';

type EnemyFactory = (level: number) => ModelEnemy;

const ENEMY_FACTORIES: Record<string, EnemyFactory> = {
  rhodagn:                   (level) => new RhodagnEnemy({ level }),
  triaggelos:                (level) => new TriaggelosEnemy({ level }),
  marble_palecore:           (level) => new MarbleAggelomoiraiPalecoreEnemy({ level }),
  marble_palesent:           (level) => new MarbleAggelomoiraiPalesentEnemy({ level }),
  marble_appendage:          (level) => new MarbleAppendageEnemy({ level }),
  ram:                       (level) => new RamEnemy({ level }),
  ram_alpha:                 (level) => new RamAlphaEnemy({ level }),
  sting:                     (level) => new StingEnemy({ level }),
  sting_alpha:               (level) => new StingAlphaEnemy({ level }),
  falsewings:                (level) => new FalsewingsEnemy({ level }),
  falsewings_alpha:          (level) => new FalsewingsAlphaEnemy({ level }),
  mudflow:                   (level) => new MudflowEnemy({ level }),
  mudflow_delta:             (level) => new MudflowDeltaEnemy({ level }),
  hedron:                    (level) => new HedronEnemy({ level }),
  hedron_delta:              (level) => new HedronDeltaEnemy({ level }),
  prism:                     (level) => new PrismEnemy({ level }),
  heavy_ram:                 (level) => new HeavyRamEnemy({ level }),
  heavy_ram_alpha:           (level) => new HeavyRamAlphaEnemy({ level }),
  heavy_sting:               (level) => new HeavyStingEnemy({ level }),
  heavy_sting_alpha:         (level) => new HeavyStingAlphaEnemy({ level }),
  effigy:                    (level) => new EffigyEnemy({ level }),
  sentinel:                  (level) => new SentinelEnemy({ level }),
  tidewalker:                (level) => new TidewalkerEnemy({ level }),
  tidewalker_delta:          (level) => new TidewalkerDeltaEnemy({ level }),
  walking_chrysopolis:       (level) => new WalkingChrysopolisEnemy({ level }),
  tidalklast:                (level) => new TidalklastEnemy({ level }),
  bonekrusher_ripptusk:      (level) => new BonekrusherRipptuskEnemy({ level }),
  elite_ripptusk:            (level) => new EliteRipptuskEnemy({ level }),
  hazefyre_tuskbeast:        (level) => new HazefyreTuskbeastEnemy({ level }),
  hazefyre_claw:             (level) => new HazefyreClawEnemy({ level }),
  bonekrusher_raider:        (level) => new BonekrusherRaiderEnemy({ level }),
  elite_raider:              (level) => new EliteRaiderEnemy({ level }),
  bonekrusher_ambusher:      (level) => new BonekrusherAmbusherEnemy({ level }),
  elite_ambusher:            (level) => new EliteAmbusherEnemy({ level }),
  bonekrusher_infiltrator:   (level) => new BonekrusherInfiltratorEnemy({ level }),
  bonekrusher_vanguard:      (level) => new BonekrusherVanguardEnemy({ level }),
  bonekrusher_pyromancer:    (level) => new BonekrusherPyromancerEnemy({ level }),
  bonekrusher_arsonist:      (level) => new BonekrusherArsonistEnemy({ level }),
  bonekrusher_ballista:      (level) => new BonekrusherBallistaEnemy({ level }),
  bonekrusher_executioner:   (level) => new BonekrusherExecutionerEnemy({ level }),
  elite_executioner:         (level) => new EliteExecutionerEnemy({ level }),
  bonekrusher_siegeknuckles: (level) => new BonekrusherSiegeknucklesEnemy({ level }),
  acid_originium_slug:       (level) => new AcidOriginiumSlugEnemy({ level }),
  blazemist_originium_slug:  (level) => new BlazemistOriginiumSlugEnemy({ level }),
  firemist_originium_slug:   (level) => new FiremistOriginiumSlugEnemy({ level }),
  brutal_pincerbeast:        (level) => new BrutalPincerbeastEnemy({ level }),
  indigenous_pincerbeast:    (level) => new IndigenousPincerbeastEnemy({ level }),
  waterlamp:                 (level) => new WaterlampEnemy({ level }),
  imbued_quillbeast:         (level) => new ImbuedQuillbeastEnemy({ level }),
  quillbeast:                (level) => new QuillbeastEnemy({ level }),
  tunneling_nidwyrm:         (level) => new TunnelingNidwyrmEnemy({ level }),
  axe_armorbeast:            (level) => new AxeArmorbeastEnemy({ level }),
  hazefyre_axe_armorbeast:   (level) => new HazefyreAxeArmorbeastEnemy({ level }),
  glaring_rakerbeast:        (level) => new GlaringRakerbeastEnemy({ level }),
  spotted_rakerbeast:        (level) => new SpottedRakerbeastEnemy({ level }),
  grove_archer:              (level) => new GroveArcherEnemy({ level }),
  road_plunderer:            (level) => new RoadPlundererEnemy({ level }),
};

/** Get a model enemy instance by view-layer enemy ID. */
export function getModelEnemy(enemyId: string, level: number = 90): ModelEnemy | null {
  const factory = ENEMY_FACTORIES[enemyId];
  return factory ? factory(level) : null;
}
