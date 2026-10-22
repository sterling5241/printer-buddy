(() => {
  const { el } = PB, { onPage, cur, send, live, dialog, pageHook } = PB.x;
  const cd = dialog("pb-camdlg");
  const SERVICES = [["mjpegstreamer", "MJPEG stream"], ["mjpegstreamer-adaptive", "MJPEG (snapshots, adaptive)"], ["webrtc-camerastreamer", "WebRTC (camera-streamer)"],
                    ["webrtc-go2rtc", "WebRTC (go2rtc)"], ["webrtc-mediamtx", "WebRTC (MediaMTX)"], ["hlsstream", "HLS"], ["iframe", "Web page (iframe)"]];
  PB.editCameras = async () => {
    const p = cur(); if (!p) return;
    let cams = [];
    try { cams = (await PB.rpc("server.webcams.list"))?.webcams || []; } catch (e) { return toast(e.message); }
    const list = () => {
      cd.innerHTML = `<h3>Cameras on ${esc(p.name)}</h3><p class="pb-muted">Saved in Moonraker, so Mainsail and Fluidd see the same list.
          Printer Buddy shows MJPEG cameras live and uses snapshots for the rest.</p>
        <div class="pb-plist">${cams.map((c, i) => `<div class="pb-prow"><div class="pb-prowtop"><b>${esc(c.name)}</b>${c.enabled === false ? `<span class="pb-chip">off</span>` : ""}
            <span class="bd-sp"></span><button type="button" data-e="${i}">Edit</button><button type="button" data-d="${i}" aria-label="Delete">${PB.ic.x}</button></div>
            <div class="pb-muted pb-mono">${esc(c.service || "")} · ${esc(c.stream_url || "")}</div></div>`).join("") || `<p class="pb-muted">No cameras yet.</p>`}</div>
        <div class="bd-libfoot"><button type="button" data-a="add">+ Add camera</button><span class="bd-sp"></span><button type="button" data-a="close">Close</button></div>`;
      cd.querySelector("[data-a=close]").onclick = () => cd.close();
      cd.querySelector("[data-a=add]").onclick = () => form({ name: "", service: "mjpegstreamer-adaptive", stream_url: "/webcam/?action=stream", snapshot_url: "/webcam/?action=snapshot",
        target_fps: 15, flip_horizontal: false, flip_vertical: false, rotation: 0, aspect_ratio: "16:9", enabled: true });
      for (const b of cd.querySelectorAll("[data-e]")) b.onclick = () => form({ ...cams[+b.dataset.e] });
      for (const b of cd.querySelectorAll("[data-d]")) b.onclick = async () => {
        const c = cams[+b.dataset.d]; if (!confirm(`Delete the camera "${c.name}"?`)) return;
        try { await PB.rpc("server.webcams.delete_item", c.uid ? { uid: c.uid } : { name: c.name }); cams.splice(+b.dataset.d, 1); list(); toast("Camera deleted"); } catch (e) { toast(e.message); }
      };
    };
    const form = c => {
      cd.innerHTML = `<h3>${c.uid ? "Edit camera" : "Add a camera"}</h3><form class="pb-camform">
          <label>Name<input name="name" value="${esc(c.name || "")}" required></label>
          <label>Type<select name="service">${SERVICES.map(([v, l]) => `<option value="${v}"${v === c.service ? " selected" : ""}>${l}</option>`).join("")}</select></label>
          <label class="w">Stream URL<input name="stream_url" value="${esc(c.stream_url || "")}" spellcheck="false"></label>
          <label class="w">Snapshot URL<input name="snapshot_url" value="${esc(c.snapshot_url || "")}" spellcheck="false"></label>
          <label>Frames per second<input name="target_fps" type="number" min="1" max="60" value="${esc(String(c.target_fps ?? 15))}"></label>
          <label>Rotate<select name="rotation">${[0, 90, 180, 270].map(r => `<option${+c.rotation === r ? " selected" : ""}>${r}</option>`).join("")}</select></label>
          <label>Shape<select name="aspect_ratio">${["16:9", "4:3", "1:1"].map(r => `<option${c.aspect_ratio === r ? " selected" : ""}>${r}</option>`).join("")}</select></label>
          <label class="bd-check"><input type="checkbox" name="flip_horizontal"${c.flip_horizontal ? " checked" : ""}> Flip left-right</label>
          <label class="bd-check"><input type="checkbox" name="flip_vertical"${c.flip_vertical ? " checked" : ""}> Flip upside-down</label>
          <label class="bd-check"><input type="checkbox" name="enabled"${c.enabled !== false ? " checked" : ""}> On</label></form>
        <p class="pb-muted">URLs starting with / are on the printer itself (e.g. /webcam/?action=stream).</p>
        <div class="bd-libfoot"><button type="button" data-a="back">Back</button><span class="bd-sp"></span><button type="button" class="bd-primary" data-a="save">Save</button></div>`;
      cd.querySelector("[data-a=back]").onclick = list;
      cd.querySelector("[data-a=save]").onclick = async () => {
        const f = cd.querySelector("form"); if (!f.name.value.trim()) return toast("Give the camera a name");
        const item = { name: f.name.value.trim(), service: f.service.value, stream_url: f.stream_url.value.trim(), snapshot_url: f.snapshot_url.value.trim(),
          target_fps: Math.max(1, Math.min(60, +f.target_fps.value || 15)), rotation: +f.rotation.value, aspect_ratio: f.aspect_ratio.value,
          flip_horizontal: f.flip_horizontal.checked, flip_vertical: f.flip_vertical.checked, enabled: f.enabled.checked, ...(c.uid ? { uid: c.uid } : {}) };
        try {
          await PB.rpc("server.webcams.post_item", item);
          cams = (await PB.rpc("server.webcams.list"))?.webcams || []; list(); toast("Camera saved");
        } catch (e) { toast(e.message); }
      };
    };
    list(); cd.showModal();
  };
})();
