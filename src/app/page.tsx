import importedData from "@/data/output.json";
import { Activities } from "@/types";
import dynamic from "next/dynamic";

const NoSSR = dynamic(() => import("@/components/map"), {
  ssr: false,
  loading: () => <p>loading...</p>,
});

export default async function Home() {
  return <NoSSR data={importedData as Activities[]} />;
}
