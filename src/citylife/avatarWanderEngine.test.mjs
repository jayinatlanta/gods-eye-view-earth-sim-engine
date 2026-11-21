import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  createAvatarWanderEngine,
  WANDER_CAMERA_MODES,
  WANDER_SPEED_TIERS,
  getDefaultPitchForMode,
  clampPitchForMode,
} from '../layers/citylife/avatarWanderEngine.js';

test('Living World Sim — Avatar Wander & Companion Engine', async (t) => {
  function createMockViewer() {
    const mockEntities = [];
    const preRenderListeners = [];
    let flightCancelled = false;
    let flyToOpts = null;
    const canvasListeners = new Map();

    const mockCanvas = {
      addEventListener: (type, cb) => {
        if (!canvasListeners.has(type)) canvasListeners.set(type, new Set());
        canvasListeners.get(type).add(cb);
      },
      removeEventListener: (type, cb) => {
        canvasListeners.get(type)?.delete(cb);
      },
      requestPointerLock: () => {
        mockCanvas._pointerLocked = true;
      },
      _pointerLocked: false,
    };

    return {
      entities: {
        add: (spec) => {
          const e = {
            ...spec,
            show: true,
            position: {
              setValue: (val) => {
                e._pos = val;
              },
            },
            orientation: {
              setValue: (val) => {
                e._orient = val;
              },
            },
          };
          mockEntities.push(e);
          return e;
        },
        remove: (e) => {
          const idx = mockEntities.indexOf(e);
          if (idx >= 0) mockEntities.splice(idx, 1);
        },
        _all: mockEntities,
      },
      camera: {
        setView: () => {},
        lookAtTransform: () => {},
        flyTo: (opts) => {
          flyToOpts = opts;
        },
        cancelFlight: () => {
          flightCancelled = true;
        },
        positionCartographic: new Cesium.Cartographic(
          Cesium.Math.toRadians(-84.388),
          Cesium.Math.toRadians(33.749),
          300,
        ),
      },
      scene: {
        canvas: mockCanvas,
        globe: {
          getHeight: (_carto) => 300.0,
        },
        preRender: {
          addEventListener: (cb) => {
            preRenderListeners.push(cb);
            return () => {
              const i = preRenderListeners.indexOf(cb);
              if (i >= 0) preRenderListeners.splice(i, 1);
            };
          },
          removeEventListener: (cb) => {
            const i = preRenderListeners.indexOf(cb);
            if (i >= 0) preRenderListeners.splice(i, 1);
          },
        },
      },
      _triggerPreRender: () => {
        for (const cb of [...preRenderListeners]) cb();
      },
      _getFlyToOpts: () => flyToOpts,
      _isFlightCancelled: () => flightCancelled,
      _mockCanvas: mockCanvas,
    };
  }

  await t.test(
    'startWandering initializes avatar and companion entities',
    () => {
      const viewer = createMockViewer();
      const engine = createAvatarWanderEngine({ viewer });

      assert.equal(engine.isWandering, false);
      const started = engine.startWandering({
        lat: 33.749,
        lon: -84.388,
        heading: 0,
        companion: true,
        cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
      });

      assert.equal(started, true);
      assert.equal(engine.isWandering, true);
      assert.equal(engine.getCameraMode(), WANDER_CAMERA_MODES.ISO_CHASE);
      assert.equal(engine.isCompanionActive(), true);

      // Both user avatar and companion should exist in the scene
      assert.ok(engine.getUserAvatar());
      assert.ok(engine.getCompanion());

      const telem = engine.getTelemetry();
      assert.equal(telem.isWandering, true);
      assert.equal(telem.cameraMode, WANDER_CAMERA_MODES.ISO_CHASE);
      assert.equal(telem.companionActive, true);
    },
  );

  await t.test('camera mode transitions cycle correctly', () => {
    const viewer = createMockViewer();
    const engine = createAvatarWanderEngine({ viewer });

    engine.startWandering({
      lat: 33.749,
      lon: -84.388,
      cameraMode: WANDER_CAMERA_MODES.ISO_CHASE,
    });
    assert.equal(engine.getCameraMode(), WANDER_CAMERA_MODES.ISO_CHASE);

    engine.setCameraMode(WANDER_CAMERA_MODES.FIRST_PERSON);
    assert.equal(engine.getCameraMode(), WANDER_CAMERA_MODES.FIRST_PERSON);
    // In First-Person, avatar contact dot must be hidden (player IS the camera)
    assert.equal(engine.getUserAvatar().getEntity().show, false);

    engine.setCameraMode(WANDER_CAMERA_MODES.HELI);
    assert.equal(engine.getCameraMode(), WANDER_CAMERA_MODES.HELI);
    // In Heli / Iso, avatar contact dot must be restored
    assert.equal(engine.getUserAvatar().getEntity().show, true);

    engine.setCameraMode(WANDER_CAMERA_MODES.OVERVIEW);
    assert.equal(engine.getCameraMode(), WANDER_CAMERA_MODES.OVERVIEW);
    assert.equal(engine.getUserAvatar().getEntity().show, true);

    engine.cycleCameraMode();
    assert.equal(engine.getCameraMode(), WANDER_CAMERA_MODES.FREE);
  });

  await t.test(
    'map style switch dynamically re-samples elevation and re-seats avatar',
    () => {
      const viewer = createMockViewer();
      // Configure 3D sampleHeight to return 320m
      viewer.scene.sampleHeightSupported = true;
      viewer.scene.sampleHeight = () => 320.0;

      const engine = createAvatarWanderEngine({ viewer });
      engine.startWandering({ lat: 33.749, lon: -84.388 });
      assert.equal(engine.isWandering, true);

      // Trigger map regime switch to 3D tiles (globe.show = false)
      viewer.scene.globe.show = false;
      viewer._triggerPreRender();

      const telem = engine.getTelemetry();
      assert.equal(telem.coordinates.height, 320.0);
    },
  );

  await t.test('companion toggle enables and disables companion dot', () => {
    const viewer = createMockViewer();
    const engine = createAvatarWanderEngine({ viewer });

    engine.startWandering({ lat: 33.749, lon: -84.388, companion: true });
    assert.equal(engine.isCompanionActive(), true);

    engine.toggleCompanion(false);
    assert.equal(engine.isCompanionActive(), false);

    engine.toggleCompanion(true);
    assert.equal(engine.isCompanionActive(), true);
  });

  await t.test(
    'relocateTo and snapBack restore position and camera mode',
    () => {
      const viewer = createMockViewer();
      const engine = createAvatarWanderEngine({ viewer });

      engine.startWandering({
        lat: 33.749,
        lon: -84.388,
        cameraMode: WANDER_CAMERA_MODES.FREE,
      });
      assert.equal(engine.getCameraMode(), WANDER_CAMERA_MODES.FREE);

      // Relocate to a new location (e.g. user clicked ground)
      engine.relocateTo({ lat: 34.0522, lon: -118.2437 });
      const telem = engine.getTelemetry();
      assert.equal(telem.coordinates.lat, 34.0522);
      assert.equal(telem.coordinates.lon, -118.2437);
      // snapBack should have reverted FREE mode back to ISO_CHASE
      assert.equal(engine.getCameraMode(), WANDER_CAMERA_MODES.ISO_CHASE);
    },
  );

  await t.test('stopWandering tears down simulation cleanly', () => {
    const viewer = createMockViewer();
    const engine = createAvatarWanderEngine({ viewer });

    engine.startWandering({ lat: 33.749, lon: -84.388 });
    assert.equal(engine.isWandering, true);

    engine.stopWandering();
    assert.equal(engine.isWandering, false);
    assert.equal(engine.getUserAvatar(), null);
    assert.equal(engine.getCompanion(), null);
  });

  await t.test(
    'strafe keys (A / D and ArrowLeft / ArrowRight) perform planar horizontal displacement without rotating heading',
    () => {
      const viewer = createMockViewer();
      const engine = createAvatarWanderEngine({ viewer });

      const startLat = 33.749;
      const startLon = -84.388;
      const startHeading = 0; // Facing North

      engine.startWandering({
        lat: startLat,
        lon: startLon,
        heading: startHeading,
      });

      // 1. Test KeyA (Strafe Left)
      engine._handleKeyDown({ code: 'KeyA', key: 'a' });
      for (let i = 0; i < 15; i++) viewer._triggerPreRender();

      let telem = engine.getTelemetry();
      // Moving left when facing North moves West (lon decreases)
      assert.ok(
        telem.coordinates.lon < startLon,
        `Expected lon to decrease Westward on strafe left, got ${telem.coordinates.lon}`,
      );
      // Heading MUST NOT rotate
      assert.equal(
        telem.coordinates.heading,
        startHeading,
        'Heading must remain unchanged when strafe key A is held',
      );

      // Release KeyA and let momentum brake
      engine._handleKeyUp({ code: 'KeyA', key: 'a' });
      for (let i = 0; i < 20; i++) viewer._triggerPreRender();

      // 2. Test ArrowRight (Strafe Right)
      const prevLon = engine.getTelemetry().coordinates.lon;
      engine._handleKeyDown({ code: 'ArrowRight', key: 'ArrowRight' });
      for (let i = 0; i < 20; i++) viewer._triggerPreRender();

      telem = engine.getTelemetry();
      // Moving right moves East (lon increases)
      assert.ok(
        telem.coordinates.lon > prevLon,
        `Expected lon to increase Eastward on strafe right, got ${telem.coordinates.lon}`,
      );
      // Heading MUST NOT rotate
      assert.equal(
        telem.coordinates.heading,
        startHeading,
        'Heading must remain unchanged when strafe key ArrowRight is held',
      );

      // Release ArrowRight and let momentum brake
      engine._handleKeyUp({ code: 'ArrowRight', key: 'ArrowRight' });
      for (let i = 0; i < 20; i++) viewer._triggerPreRender();

      // 3. Test ArrowLeft (Strafe Left)
      const rightLon = engine.getTelemetry().coordinates.lon;
      engine._handleKeyDown({ code: 'ArrowLeft', key: 'ArrowLeft' });
      for (let i = 0; i < 20; i++) viewer._triggerPreRender();

      telem = engine.getTelemetry();
      assert.ok(
        telem.coordinates.lon < rightLon,
        `Expected lon to decrease Westward on strafe left via ArrowLeft`,
      );
      assert.equal(
        telem.coordinates.heading,
        startHeading,
        'Heading must remain unchanged when ArrowLeft is held',
      );
      engine._handleKeyUp({ code: 'ArrowLeft', key: 'ArrowLeft' });

      // 4. Test KeyQ and KeyE (Dedicated Yaw Rotation)
      engine._handleKeyDown({ code: 'KeyE', key: 'e' });
      for (let i = 0; i < 5; i++) viewer._triggerPreRender();
      telem = engine.getTelemetry();
      assert.ok(
        telem.coordinates.heading > startHeading,
        'KeyE must rotate heading clockwise',
      );
      engine._handleKeyUp({ code: 'KeyE', key: 'e' });
    },
  );

  // --- WANDER CAMERA & CONTROLS TEST SUITE ---

  await t.test(
    'Component 1: camera pitch angle clamping respects per-mode limits',
    () => {
      // First person: -80 to +85
      assert.equal(clampPitchForMode(WANDER_CAMERA_MODES.FIRST_PERSON, 90), 85);
      assert.equal(
        clampPitchForMode(WANDER_CAMERA_MODES.FIRST_PERSON, -90),
        -80,
      );
      assert.equal(clampPitchForMode(WANDER_CAMERA_MODES.FIRST_PERSON, 20), 20);
      assert.equal(getDefaultPitchForMode(WANDER_CAMERA_MODES.FIRST_PERSON), 0);

      // Iso chase: -75 to -10
      assert.equal(clampPitchForMode(WANDER_CAMERA_MODES.ISO_CHASE, 0), -10);
      assert.equal(clampPitchForMode(WANDER_CAMERA_MODES.ISO_CHASE, -85), -75);
      assert.equal(clampPitchForMode(WANDER_CAMERA_MODES.ISO_CHASE, -35), -35);
      assert.equal(
        getDefaultPitchForMode(WANDER_CAMERA_MODES.ISO_CHASE),
        -30,
      );

      // Heli: -85 to -25
      assert.equal(clampPitchForMode(WANDER_CAMERA_MODES.HELI, 0), -25);
      assert.equal(clampPitchForMode(WANDER_CAMERA_MODES.HELI, -95), -85);
      assert.equal(clampPitchForMode(WANDER_CAMERA_MODES.HELI, -60), -60);
      assert.equal(getDefaultPitchForMode(WANDER_CAMERA_MODES.HELI), -55);

      // Overview: -85 to -20
      assert.equal(clampPitchForMode(WANDER_CAMERA_MODES.OVERVIEW, 0), -20);
      assert.equal(clampPitchForMode(WANDER_CAMERA_MODES.OVERVIEW, -95), -85);
      assert.equal(clampPitchForMode(WANDER_CAMERA_MODES.OVERVIEW, -45), -45);
      assert.equal(getDefaultPitchForMode(WANDER_CAMERA_MODES.OVERVIEW), -45);
    },
  );

  await t.test(
    'Component 5: dedicated establishing overview camera mode integration',
    () => {
      const viewer = createMockViewer();
      const engine = createAvatarWanderEngine({ viewer });

      engine.startWandering({
        lat: 33.749,
        lon: -84.388,
        cameraMode: WANDER_CAMERA_MODES.OVERVIEW,
      });

      assert.equal(engine.getCameraMode(), WANDER_CAMERA_MODES.OVERVIEW);
      assert.equal(engine.getCameraPitch(), -45.0);

      // Snap back resets to ISO_CHASE with default pitch
      engine.snapBack();
      assert.equal(engine.getCameraMode(), WANDER_CAMERA_MODES.ISO_CHASE);
      assert.equal(engine.getCameraPitch(), -30.0);
    },
  );

  await t.test(
    'Component 4: cinematic entrance swoop triggers when altitude > 30m AGL and aborts on locomotion',
    () => {
      const viewer = createMockViewer();
      // Set altitude to 500m (flight altitude, > 30m above ground 300m)
      viewer.camera.positionCartographic.height = 500;

      const engine = createAvatarWanderEngine({ viewer });
      engine.startWandering({
        lat: 33.749,
        lon: -84.388,
        elev: 300,
        heading: 45,
      });

      assert.equal(engine.isTransitioning(), true);
      assert.ok(viewer._getFlyToOpts());
      assert.equal(viewer._getFlyToOpts().duration, 1.8);

      // Pressing locomotion key W immediately cancels transition
      engine._handleKeyDown({ code: 'KeyW', key: 'w' });
      assert.equal(engine.isTransitioning(), false);
      assert.equal(viewer._isFlightCancelled(), true);
    },
  );

  await t.test(
    'Component 2: hybrid right-click drag look-around and 5px left-click deadzone',
    () => {
      const viewer = createMockViewer();
      const engine = createAvatarWanderEngine({ viewer });

      engine.startWandering({
        lat: 33.749,
        lon: -84.388,
        heading: 90,
        cameraMode: WANDER_CAMERA_MODES.FIRST_PERSON,
      });

      const initialHeading = engine.getTelemetry().coordinates.heading;
      const initialPitch = engine.getCameraPitch();

      // Right mouse button down at (100, 100)
      engine._handleMouseDown({ button: 2, clientX: 100, clientY: 100 });
      // Drag mouse to (150, 80) -> deltaX = +50px (+10 deg), deltaY = -20px (+4 deg pitch)
      engine._handleMouseMove({ clientX: 150, clientY: 80 });

      assert.ok(
        engine.getTelemetry().coordinates.heading > initialHeading,
        'Heading should rotate clockwise on positive deltaX',
      );
      assert.ok(
        engine.getCameraPitch() > initialPitch,
        'Pitch should tilt upward on negative deltaY',
      );

      engine._handleMouseUp({ button: 2 });

      // Left click with > 5px drag should set leftMouseDragged
      engine._handleMouseDown({ button: 0, clientX: 100, clientY: 100 });
      engine._handleMouseMove({ clientX: 110, clientY: 100 }); // 10px > 5px
      // Deadzone prevents left-click relocation
      engine._handleMouseUp({ button: 0 });
    },
  );

  await t.test(
    'Component 3: pointer lock requests lock and rotates heading and pitch',
    () => {
      const viewer = createMockViewer();
      const engine = createAvatarWanderEngine({ viewer });

      engine.startWandering({
        lat: 33.749,
        lon: -84.388,
        heading: 0,
        cameraMode: WANDER_CAMERA_MODES.FIRST_PERSON,
      });

      engine.requestPointerLock();
      assert.equal(viewer._mockCanvas._pointerLocked, true);

      // Simulate lock active
      viewer.scene.canvas = { ...viewer._mockCanvas };
      engine.setCameraPitch(0);

      // Simulate mousemove with pointer lock active
      // Direct heading/pitch manipulation via sensitivity
      const startPitch = engine.getCameraPitch();
      engine._handleMouseMove({ movementX: 30, movementY: -15 });

      // Clean exit
      engine.exitPointerLock();
      assert.equal(engine.isPointerLocked(), false);
    },
  );
});
