function getImportPath(filename) {
            return `./${filename}`;
        }
            const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["copilot_web/workflowChat-D6xy3nCH.js","copilot_web/vendor-markdown-B4Av9P7l.js","copilot_web/vendor-react-ByKzdfMq.js","copilot_web/message-components-ChW91pwb.js","copilot_web/input.js","copilot_web/assets/input-DcMY2yOB.css","copilot_web/fonts.css"].map(path => {
                        const apiBase = window.comfyAPI?.api?.api?.api_base;
                        if (apiBase) {
                            // 有 API base 时，使用完整路径
                            return `${apiBase.substring(1)}/${path}`;
                        } else {        
                            // 没有 API base 时，使用相对路径
                            return `./${path}`;
                        }
                    }))))=>i.map(i=>d[i]);
import{_ as a}from"./input.js";import{j as o}from"./vendor-markdown-B4Av9P7l.js";import{r as t,R as i}from"./vendor-react-ByKzdfMq.js";import{C as n}from"./message-components-ChW91pwb.js";const s={EXPLAIN_NODE:"copilot:explain-node",TOOLBOX_USAGE:"copilot:toolbox-usage",TOOLBOX_PARAMETERS:"copilot:toolbox-parameters",TOOLBOX_DOWNSTREAMNODES:"copilot:toolbox-downstreamnodes"},d=i.lazy(()=>a(()=>import(getImportPath("workflowChat-D6xy3nCH.js")).then(e=>e.w),__vite__mapDeps([0,1,2,3,4,5,6])).then(e=>({default:e.default})));function c(){const[e,r]=t.useState(!1);return t.useEffect(()=>{const l=()=>{r(!0)};return window.addEventListener(s.EXPLAIN_NODE,l),()=>window.removeEventListener(s.EXPLAIN_NODE,l)},[]),o.jsx(n,{children:o.jsx("div",{className:"h-full w-full flex flex-col",children:o.jsx(t.Suspense,{fallback:o.jsx("div",{className:"h-full w-full flex items-center justify-center",children:"Loading..."}),children:o.jsx(d,{visible:!0,triggerUsage:e,onUsageTriggered:()=>r(!1)})})})})}const O=Object.freeze(Object.defineProperty({__proto__:null,default:c},Symbol.toStringTag,{value:"Module"}));export{O as A,s as C};
