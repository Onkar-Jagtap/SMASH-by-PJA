import React, { useEffect, useRef } from "react";
import * as d3 from "d3";

export function ThreatMatrix({ results }: { results: any[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || results.length === 0) return;
    containerRef.current.innerHTML = "";

    const width = containerRef.current.clientWidth || 800;
    const height = 400;

    const nodes: any[] = [];
    const links: any[] = [];
    
    const targetSet = new Set();
    const suppSet = new Set();

    // Limit to top 100 targets to keep it performant and distinct
    const limitedResults = results.slice(0, 100);

    limitedResults.forEach(r => {
      if (!targetSet.has(r.input)) {
        nodes.push({ id: r.input, group: 1 });
        targetSet.add(r.input);
      }
      
      const bestMatch = r.matches[0];
      if (bestMatch && (bestMatch.relation === 'same_company' || bestMatch.relation === 'same_group')) {
        if (!suppSet.has(bestMatch.candidate)) {
            nodes.push({ id: bestMatch.candidate, group: 2 });
            suppSet.add(bestMatch.candidate);
        }
        links.push({
            source: r.input,
            target: bestMatch.candidate,
            value: bestMatch.relation === 'same_company' ? 2 : 1
        });
      }
    });

    const svg = d3.select(containerRef.current)
      .append("svg")
      .attr("width", "100%")
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height]);

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-150))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d: any) => d.value === 2 ? "#00FF41" : "#f8d820")
      .attr("stroke-opacity", (d: any) => d.value === 2 ? 0.8 : 0.5)
      .attr("stroke-width", (d: any) => d.value === 2 ? 3 : 1)
      .attr("stroke-dasharray", (d: any) => d.value === 1 ? "5,5" : "none");

    const node = svg.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d: any) => d.group === 1 ? 8 : 12)
      .attr("fill", (d: any) => d.group === 1 ? "#00FF41" : "#e52521")
      .attr("class", "cursor-move")
      .call(drag(simulation) as any);

    node.append("title")
      .text((d: any) => d.id);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("cx", (d: any) => Math.max(12, Math.min(width - 12, d.x)))
        .attr("cy", (d: any) => Math.max(12, Math.min(height - 12, d.y)));
    });

    function drag(simulation: any) {
      function dragstarted(event: any) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }
      
      function dragged(event: any) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }
      
      function dragended(event: any) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }
      
      return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }
    
    return () => {
      simulation.stop();
    };
  }, [results]);

  return (
    <div className="w-full relative retro-border border-[#00B140] mb-8 bg-black overflow-hidden shadow-[8px_8px_0_0_rgba(0,177,64,0.3)]">
        {/* Radar Background styling */}
        <div className="absolute inset-0 pointer-events-none radar-bg opacity-30"></div>
        <div className="absolute inset-0 pointer-events-none radar-grid opacity-30"></div>
        <div className="absolute pointer-events-none radar-sweep"></div>
        
        <div className="absolute top-4 left-4 z-10 text-[#00FF41] font-pixel text-xs p-2 bg-black border border-[#00FF41]">
          THREAT MATRIX
        </div>
        
        {/* Container for D3 Canvas */}
        <div ref={containerRef} className="w-full h-[400px] relative z-20 mix-blend-screen" />
        
        <div className="absolute bottom-4 left-4 z-10 text-[#00FF41] font-pixel text-[8px] flex flex-col gap-2">
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#00FF41] block"></span> TARGET</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#e52521] block border border-white"></span> SUPPRESSION (BOSS)</div>
        </div>
    </div>
  );
}
