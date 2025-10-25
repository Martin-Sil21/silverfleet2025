import React, { useState, useMemo, useEffect, useRef, WheelEvent } from 'react';
import type { ParsedN8nWorkflow, AuditResult, ExecutionStep, ParsedN8nNode } from '../types';
import { useTranslation } from '../hooks/useTranslation';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { XCircleIcon } from './icons/XCircleIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { PlusIcon } from './icons/PlusIcon';
import { MinusIcon } from './icons/MinusIcon';
import { ArrowPathIcon } from './icons/ArrowPathIcon';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;

const Node: React.FC<{
  node: ParsedN8nWorkflow['nodes'][0];
  step: ExecutionStep | undefined;
  onClick: () => void;
  isSelected: boolean;
}> = ({ node, step, onClick, isSelected }) => {
    const status = step?.status || 'PENDING';
    
    const statusStyles = useMemo(() => {
        if (isSelected) return 'border-primary-500 ring-2 ring-primary-500 bg-primary-50 dark:bg-primary-900/50';
        switch (status) {
            case 'SUCCESS': return 'border-green-500 bg-green-50 dark:bg-green-900/50';
            case 'ERROR': return 'border-red-500 bg-red-50 dark:bg-red-900/50';
            case 'RUNNING': return 'border-primary-500 bg-primary-50 dark:bg-primary-900/50 animate-pulse';
            default: return 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800';
        }
    }, [status, isSelected]);
    
    const Icon = useMemo(() => {
        if(node.nodeType === 'agent') return <SparklesIcon className="w-5 h-5 text-purple-500" />;
        // Other icons can be added for specific tool types if needed
        return null;
    }, [node.nodeType]);

  return (
    <div
      style={{
        position: 'absolute',
        left: node.position.x,
        top: node.position.y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      }}
      className={`p-3 rounded-lg shadow-md border-2 transition-all duration-300 cursor-pointer hover:shadow-xl hover:scale-105 flex flex-col justify-center ${statusStyles}`}
      onClick={onClick}
    >
        <div className="flex items-center gap-2">
            {Icon && <div className="flex-shrink-0">{Icon}</div>}
            <div className="flex-grow min-w-0">
                <h4 className="font-bold text-sm text-gray-800 dark:text-white truncate">{node.name}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{node.type}</p>
            </div>
        </div>
    </div>
  );
};

const NodeDetailsSidebar: React.FC<{ step: ExecutionStep; node: ParsedN8nNode; onClose: () => void }> = ({ step, node, onClose }) => {
    const { t } = useTranslation();
    
    const JsonViewer: React.FC<{data: any}> = ({data}) => (
        <pre className="p-2 bg-gray-100 dark:bg-gray-900 rounded-md whitespace-pre-wrap max-h-60 overflow-auto text-xs">{JSON.stringify(data, null, 2)}</pre>
    );

    return (
        <aside className="w-96 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col shadow-2xl">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center flex-shrink-0">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">{node.name}</h3>
                <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                    <XCircleIcon className="w-6 h-6 text-gray-500" />
                </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
                <div>
                    <h4 className="font-semibold text-gray-600 dark:text-gray-400 mb-1">{t('executionStatus')}</h4>
                    <p>{step.status}</p>
                </div>
                <div>
                    <h4 className="font-semibold text-gray-600 dark:text-gray-400 mb-1">{t('executionDuration')}</h4>
                    <p>{step.durationMs}ms</p>
                </div>
                 <div>
                    <h4 className="font-semibold text-gray-600 dark:text-gray-400 mb-1">{t('inputData')}</h4>
                    <JsonViewer data={step.input} />
                 </div>
                  <div>
                    <h4 className="font-semibold text-gray-600 dark:text-gray-400 mb-1">{t('outputData')}</h4>
                    <JsonViewer data={step.output} />
                 </div>
                  <div>
                    <h4 className="font-semibold text-gray-600 dark:text-gray-400 mb-1">{t('executionLogTitle')}</h4>
                    <pre className="p-2 bg-gray-100 dark:bg-gray-900 rounded-md whitespace-pre-wrap max-h-48 overflow-auto text-xs">{step.log}</pre>
                 </div>
            </div>
        </aside>
    )
}

const ExecutionCanvas: React.FC<{
  n8nWorkflow: ParsedN8nWorkflow;
  currentTrace: AuditResult | null;
  message: string;
  totalCases: number;
  completedCases: number;
  onReset: () => void;
}> = ({ n8nWorkflow, currentTrace, message, totalCases, completedCases, onReset }) => {
    const { t } = useTranslation();
    const { nodes, connections } = n8nWorkflow;
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [viewState, setViewState] = useState({ x: 0, y: 0, zoom: 1 });
    const [isPanning, setIsPanning] = useState(false);
    const canvasRef = useRef<HTMLDivElement>(null);
    const startPan = useRef({ x: 0, y: 0 });

    const { canvasWidth, canvasHeight } = useMemo(() => {
        let maxX = 0;
        let maxY = 0;
        nodes.forEach(node => {
            if (node.position.x > maxX) maxX = node.position.x;
            if (node.position.y > maxY) maxY = node.position.y;
        });
        return { canvasWidth: maxX + NODE_WIDTH + 100, canvasHeight: maxY + NODE_HEIGHT + 100 };
    }, [nodes]);
    
    const centerAndFit = () => {
        if (!canvasRef.current) return;
        const { clientWidth, clientHeight } = canvasRef.current;
        const zoomX = clientWidth / canvasWidth;
        const zoomY = (clientHeight - 128) / canvasHeight; // Adjust for header/footer
        const newZoom = Math.min(zoomX, zoomY, 1) * 0.9;
        const newX = (clientWidth - canvasWidth * newZoom) / 2 / newZoom;
        const newY = (clientHeight - canvasHeight * newZoom) / 2 / newZoom;
        setViewState({ zoom: newZoom, x: newX, y: newY });
    };
    
    useEffect(() => {
        centerAndFit();
    }, [canvasWidth, canvasHeight]);


    const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
        e.preventDefault();
        const zoomFactor = 1.1;
        const newZoom = e.deltaY > 0 ? viewState.zoom / zoomFactor : viewState.zoom * zoomFactor;
        setViewState(vs => ({ ...vs, zoom: Math.max(0.1, Math.min(2, newZoom)) }));
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        setIsPanning(true);
        startPan.current = { x: e.clientX - viewState.x * viewState.zoom, y: e.clientY - viewState.y * viewState.zoom };
    };
    
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isPanning) return;
        const newX = (e.clientX - startPan.current.x) / viewState.zoom;
        const newY = (e.clientY - startPan.current.y) / viewState.zoom;
        setViewState(vs => ({ ...vs, x: newX, y: newY }));
    };
    
    const handleMouseUp = () => setIsPanning(false);

    const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
    const stepMap = useMemo(() => new Map(currentTrace?.executionTrace.map(s => [s.nodeId, s])), [currentTrace]);
    
    const selectedStep = selectedNodeId ? stepMap.get(selectedNodeId) : null;
    const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : null;

    return (
       <div className="w-full h-full flex flex-col font-sans">
            <header className="flex-shrink-0 h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 z-10 shadow-sm">
                <div className="flex-grow min-w-0">
                    <h2 className="text-lg font-bold text-gray-800 dark:text-white truncate">{currentTrace?.testCase?.title || t('auditInProgress')}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{completedCases} / {totalCases} Test Cases Completed</p>
                </div>
                 <button onClick={onReset} className="ml-4 px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 transition-colors">{t('errorAction')}</button>
            </header>
            <div className="flex-grow flex relative overflow-hidden">
                <div 
                    ref={canvasRef} 
                    className="flex-grow h-full bg-gray-100 dark:bg-gray-900/80 cursor-grab"
                    onWheel={handleWheel}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    <div 
                      className="origin-top-left transition-transform duration-100 ease-linear"
                      style={{ 
                          width: canvasWidth, 
                          height: canvasHeight,
                          transform: `scale(${viewState.zoom}) translate(${viewState.x}px, ${viewState.y}px)`
                       }}
                    >
                        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                            <defs>
                                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" className="fill-current text-gray-400 dark:text-gray-500" />
                                </marker>
                            </defs>
                            {connections.map((conn, index) => {
                                const sourceNode = nodeMap.get(conn.sourceNodeId);
                                const targetNode = nodeMap.get(conn.targetNodeId);
                                if (!sourceNode || !targetNode) return null;
                                
                                const sourceX = sourceNode.position.x + NODE_WIDTH;
                                const sourceY = sourceNode.position.y + NODE_HEIGHT / 2;
                                const targetX = targetNode.position.x;
                                const targetY = targetNode.position.y + NODE_HEIGHT / 2;

                                return <path key={index} d={`M ${sourceX} ${sourceY} L ${targetX} ${targetY}`} className="stroke-current text-gray-400 dark:text-gray-500" strokeWidth="2" markerEnd="url(#arrowhead)" />;
                            })}
                        </svg>
                        {nodes.map(node => (
                            <Node 
                                key={node.id} 
                                node={node} 
                                step={stepMap.get(node.id)} 
                                onClick={() => setSelectedNodeId(node.id)}
                                isSelected={selectedNodeId === node.id}
                            />
                        ))}
                    </div>
                </div>

                {selectedNode && selectedStep && <NodeDetailsSidebar step={selectedStep} node={selectedNode} onClose={() => setSelectedNodeId(null)} />}
                
                <div className="absolute bottom-4 left-4 flex gap-2">
                    <button onClick={() => setViewState(vs => ({...vs, zoom: Math.min(2, vs.zoom * 1.2)}))} className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700"><PlusIcon className="w-5 h-5"/></button>
                    <button onClick={() => setViewState(vs => ({...vs, zoom: Math.max(0.1, vs.zoom / 1.2)}))} className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700"><MinusIcon className="w-5 h-5"/></button>
                    <button onClick={centerAndFit} className="p-2 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700"><ArrowPathIcon className="w-5 h-5"/></button>
                </div>
            </div>
            <footer className="flex-shrink-0 h-32 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-2 flex flex-col">
                <h3 className="font-semibold text-sm mb-1 px-2">{t('activityLog')}</h3>
                <div className="flex-grow bg-gray-100 dark:bg-gray-900 rounded-md p-2 text-sm font-mono overflow-y-auto">
                    <p>{message}</p>
                </div>
            </footer>
       </div>
    );
};

export default ExecutionCanvas;