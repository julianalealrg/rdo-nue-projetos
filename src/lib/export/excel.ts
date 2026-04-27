import * as XLSX from "xlsx";
import type { RdoCompleto, ObraComSupervisor } from "@/lib/diario";
import {
  CONDICAO_LABEL,
  PRIORIDADE_LABEL,
  TIPO_VISITA_LABEL,
  formatDataBR,
  formatHora,
  rdosOrdenadosDescendente,
  agruparPorAmbiente,
  hojeRecifeArquivo,
  sanitize,
} from "./utils";

function ultimaEdicao(r: RdoCompleto): string {
  return formatDataBR(r.updated_at?.slice(0, 10) ?? r.data);
}

export function gerarWorkbook(args: {
  obra: ObraComSupervisor;
  rdos: RdoCompleto[];
}): XLSX.WorkBook {
  const { obra, rdos } = args;
  const lista = rdosOrdenadosDescendente(rdos);

  // Planilha RDOs
  const rdosRows = lista.map((r) => {
    const totalPend = r.pendencias.length;
    const pendAbertas = r.pendencias.filter((p) => !p.resolvida_em).length;
    const ambsTrabalhados = new Set<string>();
    r.fotos.forEach((f) => f.ambiente_id && ambsTrabalhados.add(f.ambiente_id));
    r.pendencias.forEach((p) => p.ambiente_id && ambsTrabalhados.add(p.ambiente_id));
    r.pontos_atencao.forEach((p) => p.ambiente_id && ambsTrabalhados.add(p.ambiente_id));
    r.observacoes_ambiente.forEach(
      (o) => o.ambiente_id && (o.texto ?? "").trim() && ambsTrabalhados.add(o.ambiente_id),
    );
    return {
      "ID RDO": r.id,
      "ID Obra": obra.id,
      Cliente: obra.nome_cliente,
      Endereço: obra.endereco,
      Data: formatDataBR(r.data),
      "Hora chegada": formatHora(r.hora_chegada),
      "Hora saída": r.hora_saida ? formatHora(r.hora_saida) : "",
      "Tipo de visita": TIPO_VISITA_LABEL[r.tipo_visita] ?? r.tipo_visita,
      "Condição local": CONDICAO_LABEL[r.condicao_local] ?? r.condicao_local,
      Responsável: r.supervisor?.nome ?? "—",
      "Equipe NUE": r.equipe_nue
        .map((e) => (e.funcao ? `${e.nome} (${e.funcao})` : e.nome))
        .join(", "),
      Terceiros: r.terceiros
        .map((t) => (t.papel ? `${t.nome} (${t.papel})` : t.nome))
        .join(", "),
      "Registros gerais": r.registros,
      "Próximos passos": r.proximos_passos,
      "Total pendências": totalPend,
      "Pendências abertas": pendAbertas,
      "Total pontos atenção": r.pontos_atencao.length,
      "Total fotos": r.fotos.length,
      "Total ambientes trabalhados": ambsTrabalhados.size,
      Finalizado: r.finalizado ? "Sim" : "Não",
      "Última edição": ultimaEdicao(r),
    };
  });

  const wsRdos = XLSX.utils.json_to_sheet(rdosRows);
  wsRdos["!cols"] = [
    { wch: 14 }, { wch: 10 }, { wch: 24 }, { wch: 30 }, { wch: 12 },
    { wch: 11 }, { wch: 11 }, { wch: 18 }, { wch: 18 }, { wch: 22 },
    { wch: 32 }, { wch: 32 }, { wch: 50 }, { wch: 40 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 16 },
  ];
  wsRdos["!freeze"] = { xSplit: 0, ySplit: 1 };
  // Auto filter
  if (rdosRows.length > 0) {
    const range = XLSX.utils.decode_range(wsRdos["!ref"]!);
    wsRdos["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
  }

  // Planilha Pendências
  const pendRows: Record<string, string | number>[] = [];
  for (const r of lista) {
    for (const p of r.pendencias) {
      pendRows.push({
        "ID Pendência": p.id,
        "ID RDO": r.id,
        "ID Obra": obra.id,
        Cliente: obra.nome_cliente,
        "Data RDO": formatDataBR(r.data),
        Ambiente: p.ambiente?.nome ?? "—",
        Descrição: p.descricao,
        Prioridade: PRIORIDADE_LABEL[p.prioridade] ?? p.prioridade,
        "Resolvida em": p.resolvida_em ? formatDataBR(p.resolvida_em.slice(0, 10)) : "",
      });
    }
  }
  const wsPend = XLSX.utils.json_to_sheet(pendRows);
  wsPend["!cols"] = [
    { wch: 36 }, { wch: 14 }, { wch: 10 }, { wch: 24 },
    { wch: 12 }, { wch: 24 }, { wch: 60 }, { wch: 12 }, { wch: 14 },
  ];
  wsPend["!freeze"] = { xSplit: 0, ySplit: 1 };
  if (pendRows.length > 0) {
    wsPend["!autofilter"] = { ref: wsPend["!ref"]! };
  }

  // Planilha Por ambiente
  const porAmbRows: Record<string, string | number>[] = [];
  for (const r of lista) {
    const { grupos } = agruparPorAmbiente(r);
    for (const g of grupos) {
      const obs = r.observacoes_ambiente.find((o) => o.ambiente_id === g.id)?.texto ?? "";
      porAmbRows.push({
        "ID RDO": r.id,
        "ID Obra": obra.id,
        Cliente: obra.nome_cliente,
        Data: formatDataBR(r.data),
        Ambiente: g.nome,
        "Tem observação?": obs.trim() !== "" ? "Sim" : "Não",
        "N fotos": g.fotos.length,
        "N pendências": g.pendencias.length,
        "N pontos atenção": g.pontos.length,
        Observação: obs,
      });
    }
  }
  const wsAmb = XLSX.utils.json_to_sheet(porAmbRows);
  wsAmb["!cols"] = [
    { wch: 14 }, { wch: 10 }, { wch: 24 }, { wch: 12 },
    { wch: 24 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 50 },
  ];
  wsAmb["!freeze"] = { xSplit: 0, ySplit: 1 };
  if (porAmbRows.length > 0) {
    wsAmb["!autofilter"] = { ref: wsAmb["!ref"]! };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsRdos, "RDOs");
  XLSX.utils.book_append_sheet(wb, wsPend, "Pendências");
  XLSX.utils.book_append_sheet(wb, wsAmb, "Por ambiente");
  return wb;
}

export function nomeArquivoExcel(args: {
  escopo: "diario" | "rdo";
  obra: ObraComSupervisor;
  rdoId?: string;
}): string {
  const cliente = sanitize(args.obra.nome_cliente);
  if (args.escopo === "rdo" && args.rdoId) {
    return `rdo-${sanitize(args.rdoId)}-${cliente}.xlsx`;
  }
  return `diario-${sanitize(args.obra.id)}-${cliente}-${hojeRecifeArquivo()}.xlsx`;
}

export async function exportarExcel(args: {
  escopo: "diario" | "rdo";
  obra: ObraComSupervisor;
  rdos: RdoCompleto[];
  rdo?: RdoCompleto;
}): Promise<void> {
  const { saveAs } = await import("file-saver");
  const lista = args.escopo === "rdo" && args.rdo ? [args.rdo] : args.rdos;
  const wb = gerarWorkbook({ obra: args.obra, rdos: lista });
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  saveAs(
    blob,
    nomeArquivoExcel({
      escopo: args.escopo,
      obra: args.obra,
      rdoId: args.rdo?.id,
    }),
  );
}
