import type { ActivityKind } from "./garmin.js";

export interface DemoPlace {
  name: string;
  timezone: string;
}

export interface DemoRoute {
  /** Stable key into `demoRouteGeometry.json`, where this route's road-snapped
   * geometry lives. */
  id: string;
  type: ActivityKind;
  place: DemoPlace;
  /**
   * Corners of a closed circuit, in order and returning to the first. These are
   * only the shape of the intended route — `npm run snap-routes` sends them to
   * a routing service and stores the real streets and paths that connect them,
   * which is what the track generator actually follows. Every route is a loop
   * on purpose: real routes from a home address usually are, and it saves the
   * generator a separate out-and-back case.
   *
   * Corners are placed by hand and then pulled onto the walkable network by the
   * snapping script's repair pass, which is why several sit a couple of hundred
   * metres off the obvious landmark: a corner in the middle of a harbour routes
   * the long way round to the nearest bridge.
   */
  waypoints: [number, number][];
  /** Relative pick frequency. A handful of routes carry most of the history,
   * which is what gives the route-frequency map its bright core. */
  weight: number;
}

const COPENHAGEN: DemoPlace = { name: "Copenhagen", timezone: "Europe/Copenhagen" };
const BERLIN: DemoPlace = { name: "Berlin", timezone: "Europe/Berlin" };
const STOCKHOLM: DemoPlace = { name: "Stockholm", timezone: "Europe/Stockholm" };

// Home routes: the everyday circuits, walked and ridden over and over.
export const HOME_ROUTES: DemoRoute[] = [

  {
    id: "cph-lakes",
    type: "walk",
    place: COPENHAGEN,
    weight: 5,
    waypoints: [
      [55.6788, 12.5522], [55.6812, 12.5546], [55.6845, 12.5578], [55.6878, 12.561],
      [55.691, 12.5648], [55.6928, 12.5672], [55.6942, 12.564], [55.6918, 12.56],
      [55.6885, 12.5562], [55.6852, 12.5528], [55.6818, 12.5498], [55.6792, 12.5488],
    ],
  },
  {
    id: "cph-harbour-kastellet",
    type: "walk",
    place: COPENHAGEN,
    weight: 4,
    waypoints: [
      [55.6752, 12.5703], [55.6752, 12.573], [55.6768, 12.58], [55.6784, 12.5862],
      [55.6797, 12.5908], [55.682, 12.5928], [55.6845, 12.5936], [55.6875, 12.5945],
      [55.6906, 12.5948], [55.6909, 12.5954], [55.6907, 12.5955], [55.689, 12.5975],
      [55.6862, 12.59], [55.683, 12.586], [55.68, 12.582], [55.677, 12.576],
      [55.6748, 12.57],
    ],
  },
  {
    id: "cph-christianshavn-refshaleoen",
    type: "walk",
    place: COPENHAGEN,
    weight: 2,
    waypoints: [
      [55.6726, 12.5878], [55.674, 12.593], [55.676, 12.5985], [55.679, 12.6035],
      [55.6825, 12.6072], [55.6868, 12.6094], [55.689, 12.6112], [55.6892, 12.6113],
      [55.6886, 12.6029], [55.6845, 12.6], [55.6805, 12.5976], [55.6768, 12.592],
      [55.6738, 12.5892],
    ],
  },
  {
    id: "cph-faelledparken",
    type: "walk",
    place: COPENHAGEN,
    weight: 3,
    waypoints: [
      [55.6968, 12.5704], [55.6992, 12.5722], [55.7016, 12.576], [55.7032, 12.5808],
      [55.7018, 12.5852], [55.699, 12.5836], [55.6968, 12.5798], [55.6952, 12.5752],
      [55.6955, 12.571],
    ],
  },
  {
    id: "cph-assistens-noerrebro",
    type: "walk",
    place: COPENHAGEN,
    weight: 3,
    waypoints: [
      [55.6866, 12.5486], [55.6888, 12.5518], [55.6912, 12.554], [55.6936, 12.5512],
      [55.6928, 12.5462], [55.6902, 12.5432], [55.6878, 12.545],
    ],
  },
  {
    id: "cph-frederiksberg-have",
    type: "walk",
    place: COPENHAGEN,
    weight: 2,
    waypoints: [
      [55.6742, 12.5312], [55.6758, 12.5262], [55.6778, 12.522], [55.68, 12.5252],
      [55.679, 12.53], [55.6768, 12.5338], [55.675, 12.534],
    ],
  },
  {
    id: "cph-islands-brygge",
    type: "walk",
    place: COPENHAGEN,
    weight: 3,
    waypoints: [
      [55.6702, 12.5782], [55.6672, 12.579], [55.664, 12.5818], [55.6608, 12.585],
      [55.6597, 12.5888], [55.6612, 12.589], [55.6648, 12.5872], [55.6682, 12.5836],
      [55.6699, 12.58],
    ],
  },
  {
    id: "cph-amager-faelled",
    type: "walk",
    place: COPENHAGEN,
    weight: 2,
    waypoints: [
      [55.664, 12.5716], [55.6612, 12.5748], [55.6593, 12.5805], [55.6574, 12.5828],
      [55.658, 12.5866], [55.6612, 12.5836], [55.664, 12.579], [55.6656, 12.5748],
    ],
  },
  {
    id: "cph-amager-strand",
    type: "walk",
    place: COPENHAGEN,
    weight: 1,
    waypoints: [
      [55.6528, 12.6338], [55.6566, 12.639], [55.6608, 12.6428], [55.6634, 12.6452],
      [55.6711, 12.6439], [55.6712, 12.642], [55.6698, 12.6357], [55.6619, 12.6329],
      [55.6586, 12.6348], [55.6548, 12.6308],
    ],
  },
  {
    id: "cph-vesterbro-carlsberg",
    type: "walk",
    place: COPENHAGEN,
    weight: 2,
    waypoints: [
      [55.6712, 12.558], [55.6698, 12.5512], [55.6682, 12.5442], [55.6662, 12.5372],
      [55.6688, 12.534], [55.6712, 12.5402], [55.6728, 12.5472], [55.6736, 12.554],
    ],
  },
  {
    id: "cph-kongens-have",
    type: "walk",
    place: COPENHAGEN,
    weight: 3,
    waypoints: [
      [55.6832, 12.5772], [55.6852, 12.581], [55.6872, 12.5788], [55.6856, 12.5753],
      [55.684, 12.573],
    ],
  },
  {
    id: "cph-coast-klampenborg",
    type: "bike",
    place: COPENHAGEN,
    weight: 3,
    waypoints: [
      [55.693, 12.5985], [55.702, 12.594], [55.712, 12.5868], [55.724, 12.5836],
      [55.738, 12.581], [55.752, 12.582], [55.766, 12.5842], [55.776, 12.5828],
      [55.774, 12.573], [55.7606, 12.5689], [55.746, 12.5688], [55.732, 12.568],
      [55.718, 12.5688], [55.706, 12.5712], [55.698, 12.576], [55.694, 12.586],
    ],
  },
  {
    id: "cph-amager-loop",
    type: "bike",
    place: COPENHAGEN,
    weight: 3,
    waypoints: [
      [55.672, 12.5776], [55.664, 12.582], [55.654, 12.586], [55.643, 12.585],
      [55.634, 12.588], [55.63, 12.6], [55.633, 12.618], [55.642, 12.63],
      [55.652, 12.639], [55.662, 12.643], [55.67, 12.6317], [55.674, 12.624],
      [55.676, 12.608], [55.6739, 12.592], [55.6732, 12.5852],
    ],
  },
  {
    id: "cph-damhussoeen-valby",
    type: "bike",
    place: COPENHAGEN,
    weight: 2,
    waypoints: [
      [55.6748, 12.548], [55.679, 12.532], [55.684, 12.516], [55.6876, 12.4991],
      [55.6842, 12.479], [55.676, 12.482], [55.668, 12.493], [55.662, 12.508],
      [55.6612, 12.524], [55.666, 12.538], [55.671, 12.546],
    ],
  },
  {
    id: "cph-harbour-circuit",
    type: "bike",
    place: COPENHAGEN,
    weight: 4,
    waypoints: [
      [55.6769, 12.57], [55.682, 12.586], [55.688, 12.5964], [55.6881, 12.6096],
      [55.6874, 12.6109], [55.68, 12.6016], [55.672, 12.59], [55.665, 12.582],
      [55.66, 12.572], [55.665, 12.5588], [55.672, 12.564],
    ],
  },
  {
    id: "cph-vestamager",
    type: "bike",
    place: COPENHAGEN,
    weight: 2,
    waypoints: [
      [55.6713, 12.5759], [55.6594, 12.5689], [55.648, 12.562], [55.6347, 12.5583],
      [55.6211, 12.552], [55.614, 12.56], [55.612, 12.5744], [55.618, 12.59],
      [55.63, 12.594], [55.642, 12.592], [55.654, 12.586], [55.665, 12.58],
    ],
  },
];

export interface DemoTrip {
  /** Days after the first day of history that the trip starts. */
  startDayOffset: number;
  lengthDays: number;
  routes: DemoRoute[];
}

// Two trips away from home, so the time-lapse camera has somewhere else to fly
// to and the map isn't a single blob.
export const TRIPS: DemoTrip[] = [
  {
    startDayOffset: 252,
    lengthDays: 4,
    routes: [
      {
        id: "ber-tiergarten",
        type: "walk",
        place: BERLIN,
        weight: 3,
        waypoints: [
          [52.514, 13.352], [52.5152, 13.362], [52.5192, 13.374], [52.519, 13.3742],
          [52.519, 13.3745], [52.5185, 13.365], [52.5172, 13.356], [52.5155, 13.349],
        ],
      },
      {
        id: "ber-museumsinsel",
        type: "walk",
        place: BERLIN,
        weight: 3,
        waypoints: [
          [52.519, 13.401], [52.5224, 13.396], [52.524, 13.393], [52.5265, 13.388],
          [52.525, 13.3877], [52.5215, 13.388], [52.5188, 13.395],
        ],
      },
      {
        id: "ber-tempelhof",
        type: "bike",
        place: BERLIN,
        weight: 1,
        waypoints: [
          [52.4754, 13.4], [52.472, 13.408], [52.4729, 13.416], [52.475, 13.4185],
          [52.48, 13.4155], [52.482, 13.406], [52.4796, 13.399],
        ],
      },
    ],
  },
  {
    startDayOffset: 528,
    lengthDays: 5,
    routes: [
      {
        id: "sth-gamla-stan",
        type: "walk",
        place: STOCKHOLM,
        weight: 3,
        waypoints: [
          [59.3252, 18.07], [59.3268, 18.0742], [59.3278, 18.079], [59.3249, 18.0853],
          [59.3246, 18.0848], [59.3245, 18.0755], [59.324, 18.072],
        ],
      },
      {
        id: "sth-soedermalm",
        type: "walk",
        place: STOCKHOLM,
        weight: 3,
        waypoints: [
          [59.3182, 18.07], [59.316, 18.064], [59.314, 18.057], [59.3162, 18.051],
          [59.3196, 18.056], [59.32, 18.065],
        ],
      },
      {
        id: "sth-djurgaarden",
        type: "bike",
        place: STOCKHOLM,
        weight: 1,
        waypoints: [
          [59.3284, 18.0925], [59.326, 18.0964], [59.3252, 18.1125], [59.3281, 18.126],
          [59.3339, 18.116], [59.3313, 18.1008], [59.3318, 18.096],
        ],
      },
    ],
  },
];
