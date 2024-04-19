Data visualisation of exported Google Fit data, plotting a cycle trip undertaken in april 2024 around the low countries of europe

This is a Next.js project, to run locally:

```bash
npm install
```

Then

```bash
npm run install
```

To repurpose this project to display your own data, first obtain a takeout of your Google Fit data.
https://takeout.google.com/settings/takeout
Once downloaded and extracted, copy the selected TCX files loacated in the `/Takeout/Fit/Activities` directory into the `rawdata` directory, note you should only copy over workouts you wish to plot. Dumping the entire directory could lead to an exceedingly large file

Once you have placed the data in the `rawdata` directory, run the command:

```bash
npm run parse
```
