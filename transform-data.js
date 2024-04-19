const { XMLParser } = require("fast-xml-parser");
const fs = require("fs/promises");
const path = require("path");

const main = async () => {
  const files = await fs.readdir(path.join(__dirname, "rawdata"));

  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (tagname) =>
      ![
        "DistanceMeters",
        "Time",
        "Track",
        "Lap",
        "@_Sport",
        "Id",
        "TotalTimeSeconds",
        "Calories",
        "@_StartTime",
        "LatitudeDegrees",
        "LongitudeDegrees",
        "Intensity",
        "TriggerMethod",
        "Position",
        "AltitudeMeters",
        "Activities",
        "TrainingCenterDatabase",
      ].includes(tagname),
  });

  const output = [];

  for (let i = 0; i < files.length; i++) {
    const newFile = await fs.readFile(
      path.join(__dirname, "rawdata", files[i])
    );
    const parsedFile = parser.parse(newFile.toString());
    parsedFile.TrainingCenterDatabase.Activities.Activity.forEach((act) => {
      const temp = {
        s: act["@_Sport"],
        dm: act.Lap.DistanceMeters,
        tt: act.Lap.TotalTimeSeconds,
        st: act.Lap["@_StartTime"],
        p: act.Lap.Track.Trackpoint.filter(
          (p) =>
            p.Position !== undefined &&
            p.Position.LatitudeDegrees !== undefined &&
            p.Position.LongitudeDegrees !== undefined
        ).map((x) => ({
          d: Math.round(x.DistanceMeters),
          t: x.Time,
          lt: x.Position.LatitudeDegrees,
          lg: x.Position.LongitudeDegrees,
          // a: x.AltitudeMeters,
        })),
      };
      if (temp.p.length > 0) {
        output.push(temp);
      }
    });
  }
  await fs
    .mkdir(path.join(__dirname, "src", "data"), { recursive: true })
    .catch((e) => null);
  await fs.writeFile(
    path.join(__dirname, "src", "data", "output.json"),
    JSON.stringify(output, null, 2)
  );
};

main();
