import type { View } from "@/features/dashboard/selection";

export type TourStep = {
  /** Value of the `data-tour` attribute on the element to spotlight. */
  target: string;
  /** View the step is on; the tour switches to it by itself. */
  view: View;
  title: string;
  body: string;
  /** Plain-language note on where the information on screen comes from. */
  data: string;
  /** Moves the replay to a lap that has a forecast, so the spotlit cell is not empty. */
  forecast?: boolean;
  /** Moves the replay to this share of the race, so charts that fill "so far" have content. */
  at?: number;
  /** Pin the card to the top-right corner so it does not cover a popover the step opens. */
  corner?: boolean;
};

export const VIEW_NAMES: Record<View, string> = {
  replay: "Lap replay",
  h2h: "Head to head",
  strat: "Strategy",
  ov: "Race overview",
};

export const TOUR_STEPS: TourStep[] = [
  {
    target: "header",
    view: "replay",
    title: "Four views of one race",
    body: "Lap replay follows one driver lap by lap. Head to head sets two drivers against each other, Strategy shows tyres and pit stops, and Race overview sums up the whole race. This tour visits each of them. Season, race and driver can be changed here without going back.",
    data: "The list of races and each race's driver grid.",
  },
  {
    target: "transport",
    view: "replay",
    title: "Replay controls",
    body: "Space plays or pauses. ← and → jump a lap (with Shift, 10 seconds), and the keys 1 to 6 set the speed from real time up to 60×. Drag the bar to jump to any moment.",
    data: "Real lap times and car positions of this race.",
  },
  {
    target: "track",
    view: "replay",
    title: "The circuit",
    body: "Dots are cars on the track, coloured by team; the ringed one is the driver you follow. The bar above the map shows the weather at this moment, and the sectors are marked on the lap.",
    data: "Car positions and the weather recorded during the race.",
  },
  {
    target: "left",
    view: "replay",
    title: "Left panel: the driver you follow",
    body: "The driver card shows the position and how many places gained or lost since the grid. Gap ahead and Gap behind show the nearest cars with a trend (closing or losing seconds per lap) and a plain status: in DRS range, dirty air, or clean air. Below are the gap to the leader, lap count, last and best lap, the current stint and pit stops.",
    data: "Positions, gaps, lap times and stints of this driver.",
    forecast: true,
  },
  {
    target: "lap-log",
    view: "replay",
    title: "Lap log",
    body: "Every completed lap of this driver: time, the three sector times (purple fastest overall, green personal best, yellow slower), position with the gap to the car ahead (orange under 1 s), and the forecast with how far off it was. Click a lap to jump the replay there.",
    data: "Lap and sector times, gaps, and the model's forecast for each lap.",
    forecast: true,
  },
  {
    target: "order",
    view: "replay",
    title: "Live order",
    body: "The running order at this moment: grid position, gap (Interval to the car ahead, or To leader) and age of the tyres. Rows slide as places change and flash green or red for a gain or a loss. Click a driver to follow them instead.",
    data: "Positions, gaps and tyre age of all cars, updated with the replay clock.",
    forecast: true,
  },
  {
    target: "tyres",
    view: "replay",
    title: "Tyres and strategy",
    body: "The compound on the car, whether the set is new or used, and how many laps old it is. The strip underneath is the driver's whole strategy: number of stops and the compound of each stint, with the lap you are at marked.",
    data: "Compound, tyre life and stints from the timing data.",
    forecast: true,
  },
  {
    target: "telemetry",
    view: "replay",
    title: "Telemetry",
    body: "Car data follows the replay clock: speed with the top-speed mark, RPM, throttle, brake, DRS and gear (on wide screens it sits in a card beside the map). Here you also get the headline numbers of the last lap against the field (top speed, full throttle, braking, DRS) and the speed-trap readings.",
    data: "Car telemetry summarised per lap, and speed traps.",
    forecast: true,
  },
  {
    target: "forecast",
    view: "replay",
    title: "The forecast",
    body: "The big number is the model's forecast for the lap in progress. When the car crosses the line it turns into the real lap time with the difference: green is faster than forecast, red slower, yellow outside the model's typical error. Sector bars turn purple (fastest overall), green (personal best) or yellow (slower).",
    data: "The model's forecast of each lap's time, made from the laps before it.",
    forecast: true,
  },
  {
    target: "why",
    view: "replay",
    title: "Why this number?",
    body: "This strip shows how the forecast was built. It starts from the average of the last 5 laps, and each factor (recent pace, traffic, tyres, track, race progress) then moves it: green makes the lap faster, red slower. Hover a box to see what it means. Values are relative to a typical lap of this race: they hint at which information the model used, not at what caused the time.",
    data: "Shapley values of the final model, split by factor group.",
    forecast: true,
  },

  {
    target: "lapchart",
    view: "replay",
    title: "Lap times: actual against forecast",
    body: "White is the real lap time, dashed orange the forecast, and the shaded block the 5 laps the model looked at. A lap gets a forecast only after 5 clean laps in a row on the same tyres, so race starts, pit stops and Safety Car laps are skipped. Hover a lap to see why.",
    data: "Real lap times, race-control flags and the model's forecasts.",
  },
  {
    target: "h2h-drivers",
    view: "h2h",
    title: "Pick two drivers",
    body: "Head to head compares two drivers over the same laps. Choose driver A and driver B here; clicking a driver in Live order sets the second one. Everything else on the page follows your choice.",
    data: "Both drivers' laps, stints and positions from the same race.",
    at: 0.6,
  },
  {
    target: "h2h-battle",
    view: "h2h",
    title: "The battle on track",
    body: "Both cars on the circuit with the gap between them and, sector by sector, who is usually quicker. It moves with the replay clock, like the other pages.",
    data: "Positions, gaps and sector times of both drivers.",
    at: 0.6,
  },
  {
    target: "h2h-laps",
    view: "h2h",
    title: "Lap times and the gap",
    body: "Solid lines are real lap times, dashed ones the forecasts, with pit stops marked. The gap chart below shows who is ahead lap by lap, and in Per lap mode who took time from whom. Hover a lap for the numbers.",
    data: "Real lap times and the forecasts of both drivers.",
    at: 0.6,
  },
  {
    target: "h2h-gap",
    view: "h2h",
    title: "Gap between drivers",
    body: "Gap mode shows the distance between the two at every lap line, with pit stops marked and the colour telling who is ahead. Per lap mode shows how much time one took from the other on each lap, which explains why the gap grew or shrank (pit stop laps are left out). Hover a lap for the numbers.",
    data: "Gaps at each lap line, computed from both drivers' lap times.",
    at: 0.6,
  },
  {
    target: "h2h-summary",
    view: "h2h",
    title: "Pace and comparison",
    body: "The big number is the difference in median clean-lap pace so far, in seconds per lap, and who is quicker. The table puts position, places against the grid, best and median lap, laps within 1 s of another car, pit stops and tyres used side by side; the better value is the brighter one.",
    data: "Clean laps, results and stints of both drivers so far.",
    at: 0.6,
  },
  {
    target: "strat-gantt",
    view: "strat",
    title: "Strategy of the whole field",
    body: "One bar per driver: the tyre compound of each stint, with yellow bands for Safety Car, VSC and yellow flags. The orange line is now. Click a row to follow that driver, or collapse the card to give room to the charts.",
    data: "Stints, compounds and pit stops from the timing data.",
    at: 0.7,
  },
  {
    target: "strat-pits",
    view: "strat",
    title: "Pit stops",
    body: "Every stop so far with its time in the pit lane and how much it cost against a typical stop.",
    data: "Pit entry, timing-line and exit times of each stop.",
    at: 0.7,
  },
  {
    target: "strat-degradation",
    view: "strat",
    title: "Tyre degradation",
    body: "Lap time lost as tyres age, on clean laps so far and corrected for fuel. The tables beside it give the wear per lap of tyre life for each compound.",
    data: "Clean laps of the race so far, by compound and tyre age.",
    at: 0.7,
  },
  {
    target: "ov-tiles",
    view: "ov",
    title: "The race in six numbers",
    body: "Winner, pole position, fastest lap, lead changes, pit stops, and neutralised laps (Safety Car and VSC) together with the number of retirements.",
    data: "Results, qualifying and race-control events.",
  },
  {
    target: "ov-class",
    view: "ov",
    title: "Classification",
    body: "The final result with grid, places gained, time or gap, points, best and median lap, pit stops, tyres, laps led, laps in traffic, DRS laps and speed-trap readings. Click a column to sort, and click a row to add or remove that driver in the charts below.",
    data: "Final classification, lap times and telemetry summaries of every driver.",
  },
  {
    target: "ov-quali",
    view: "ov",
    title: "Qualifying",
    body: "Q1, Q2 and Q3 times, the gap to pole and the starting grid, next to the race result. A star marks a grid penalty, and the lines mark the Q1 and Q2 cut-offs.",
    data: "Qualifying sessions and the starting grid.",
  },
  {
    target: "ov-compare",
    view: "ov",
    title: "Drivers in the charts",
    body: "Choose which drivers the charts below draw. Top 3 and Top 10 are shortcuts, and Clear empties the selection.",
    data: "Nothing new: it filters the charts below.",
  },
  {
    target: "ov-position",
    view: "ov",
    title: "Position by lap",
    body: "Where each selected driver was on every lap. Shaded bands mark laps under Safety Car, Virtual Safety Car or yellow flags, so you can see which changes came from a restart or a pit stop.",
    data: "Position at the end of every lap, and race-control flags.",
  },
  {
    target: "ov-gap",
    view: "ov",
    title: "Gap to leader",
    body: "How many seconds each selected driver was behind the leader at every lap. A line that falls is catching up; a sudden jump is usually a pit stop, and gaps shrink while the field is under Safety Car.",
    data: "Gap to the leader from the lap-by-lap timing.",
  },
  {
    target: "ov-control",
    view: "ov",
    title: "Race control",
    body: "A running feed of what happened and when: flags, retirements, lead changes and pit stops, with the lap number of each.",
    data: "Race-control messages, retirements and pit events.",
  },
  {
    target: "ov-spread",
    view: "ov",
    title: "Lap time spread",
    body: "One box per driver for their clean laps: the box is the middle 50% of laps, the white line the median, and the whiskers the rest without outliers. Drivers are sorted by median, so a narrow box means a consistent driver.",
    data: "Clean lap times of every driver.",
  },
  {
    target: "ov-team",
    view: "ov",
    title: "Team race pace",
    body: "The median clean lap of each team with its middle 50% as a band, shown as the gap to the fastest team. It is not corrected for fuel, so read it as race pace, not as car performance.",
    data: "Clean lap times grouped by team.",
  },
  {
    target: "ov-sector",
    view: "ov",
    title: "Sector dominance",
    body: "The circuit coloured sector by sector in the colour of the fastest of the drivers you selected, with their best time of that sector.",
    data: "Best sector times of the selected drivers.",
  },
  {
    target: "ov-traffic",
    view: "ov",
    title: "Traffic",
    body: "On the left, how much time drivers lost against their own clean-air pace depending on the gap to the car ahead at the start of the lap. On the right, the share of each driver's laps spent within 1 s of the car ahead.",
    data: "Lap times with the gap to the car ahead.",
  },
  {
    target: "ov-weather",
    view: "ov",
    title: "Weather through the race",
    body: "Track and air temperature, humidity, pressure and wind lap by lap, as recorded for the winner's laps, with the same shaded Safety Car and yellow-flag bands.",
    data: "Weather recorded on each lap.",
  },
  {
    target: "help",
    view: "replay",
    title: "Need this again?",
    body: "Press ? to open this tour any time; it starts on Lap replay. The logo takes you back to the start page to pick another circuit, year or driver.",
    data: "Nothing to load: this tour is only a guide.",
  },
];
