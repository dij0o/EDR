import { useEffect, useRef, useState } from "react";
import { RenderingEngine, Enums, init as coreInit } from "@cornerstonejs/core";
import { init as dicomImageLoaderInit } from "@cornerstonejs/dicom-image-loader";

coreInit();// Initialize cornerstone core
dicomImageLoaderInit();// Initialize the DICOM loader


const DicomViewer = () => {
    const content = useRef(null); // Ref to the div container
    const [initialized, setInitialized] = useState(false);
    const [isClicked, setIsClicked] = useState(false);
    const [viewerState, setViewerState] = useState({ status: "idle", message: "" });


    useEffect(() => {
        const initialize = async () => {
            setInitialized(true);
        };
        initialize();
    }, []);

    useEffect(() => {
        if (initialized && content.current) {
            const renderEngineId = "myRenderingEngine";
            const renderingEngine = new RenderingEngine(renderEngineId);

            const viewportId = "CT_AXIAL_STACK";

            const viewportInput = {
                viewportId,
                element: content.current, // Pass the DOM node
                type: Enums.ViewportType.STACK,
            };

            renderingEngine.enableElement(viewportInput);

            //const imageId = `wadouri:https://github.com/dangom/sample-dicom/raw/master/MR000000.dcm`;
            const imageId = `wadouri:${window.location.origin}/0002.DCM`;
            

            const viewport = renderingEngine.getViewport(viewportId);

            setViewerState({ status: "loading", message: "Loading DICOM image…" });
            (async () => {
                try {
                    await viewport.setStack([imageId], 0);
                    viewport.render();
                    setViewerState({ status: "success", message: "DICOM image loaded." });
                } catch (error) {
                    console.error("Error loading the DICOM image:", error);
                    setViewerState({ status: "error", message: "The DICOM image could not be loaded. Verify that an authorized file is available for this patient." });
                }
            })();
            return () => renderingEngine.destroy();
        }
    }, [initialized, isClicked]);



    let height = isClicked ? "h-[500px] opacity-100" : "max-h-0 h-[500px] overflow-hidden opacity-0" 



    return (
        <section aria-labelledby="dicom-heading">
            <h2 id="dicom-heading" className="text-3xl font-bold">Radiographic image viewer</h2>
            {
                isClicked
                ?
                <button type="button" aria-expanded="true" aria-controls="dicom-viewport" onClick={()=>{setIsClicked(false)}} className="bg-white p-2 border rounded-md my-4">Hide radiographic image</button>
                :
                <button type="button" aria-expanded="false" aria-controls="dicom-viewport" onClick={()=>{setIsClicked(true)}} className="bg-white p-2 border rounded-md my-4">Show radiographic image</button>
            }

            {viewerState.message && <p role={viewerState.status === "error" ? "alert" : "status"} className={viewerState.status === "error" ? "mb-3 text-red-700" : "mb-3 text-slate-700"}>{viewerState.message}</p>}


            <div 
                id="dicom-viewport"
                ref={content}
                aria-label="DICOM radiographic image viewport"
                className={`${height} max-w-full`}
                style={{
                    width: "min(500px, 100%)",
                    height: "500px",
                    backgroundColor: "black",
                }}
            ></div>
        </section>
    );
};

export default DicomViewer;
