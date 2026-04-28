import { createFileRoute } from "@tanstack/react-router";
import { Route as ObrasRoute } from "./obras";

const ObrasComponent = ObrasRoute.options.component;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Obras — Sistema RDO Obras" },
      { name: "description", content: "Painel de obras do Sistema RDO Obras NUE Projetos" },
      { property: "og:title", content: "Obras — Sistema RDO Obras" },
      { property: "og:description", content: "Painel de obras do Sistema RDO Obras NUE Projetos" },
    ],
  }),
  component: IndexPage,
});

function IndexPage() {
  if (!ObrasComponent) return null;
  return <ObrasComponent />;
}
