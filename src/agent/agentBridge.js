/**
 * AgentBridge: connects God's Eye View to the external agent dispatch stream (/api/agent/events).
 * Listens for commands from authorized local agent bridges or companion clients and dispatches them
 * to the GEV action runner or navigation controller.
 */

export function initAgentBridge({
  runner = null,
  operations = null,
  viewer = null,
  styleManager = null,
  sightseeingEngine = null,
  flightEngine = null,
  railwayEngine = null,
  driveEngine = null,
  boatEngine = null,
  cityEngine = null,
  corridorDrawer = null,
  getCorridorDrawer = null,
  EventSourceClass = typeof window !== 'undefined' ? window.EventSource : null,
} = {}) {
  if (!EventSourceClass) {
    return {
      destroy: () => {},
      dispatchLocal: async () => {},
    };
  }

  let eventSource = null;
  let retryTimer = null;
  let isDestroyed = false;

  async function handleAgentCommand(command) {
    if (!command || typeof command !== 'object') return;
    const { action, query, origin, destination, args = {} } = command;

    if (action === 'discover_sightseeing' || action === 'discover') {
      const target = query || args.locationQuery || args.query;
      if (target) {
        if (typeof sightseeingEngine?.discoverAndSpawn === 'function') {
          await sightseeingEngine.discoverAndSpawn(target, {
            flyTo: true,
            ...args,
          });
        } else if (typeof operations?.searchAndFlyTo === 'function') {
          await operations.searchAndFlyTo(target);
        } else if (typeof runner === 'function') {
          await runner('fly_to_location', { locationQuery: target });
        }
      }
      return;
    }

    if (action === 'explore' || action === 'goto') {
      const target = query || args.locationQuery || args.query;
      if (target) {
        if (typeof operations?.searchAndFlyTo === 'function') {
          await operations.searchAndFlyTo(target);
        } else if (typeof runner === 'function') {
          await runner('fly_to_location', { locationQuery: target });
        }
      }
      return;
    }

    if (action === 'fly_route') {
      const from = origin || args.from;
      const to = destination || args.to;
      if (typeof flightEngine?.spawnFlightRoute === 'function') {
        await flightEngine.spawnFlightRoute(from, to, args);
      } else if (typeof runner === 'function') {
        await runner('fly_route', { ...args, from, to });
      }
      return;
    }

    if (action === 'rail_route' || action === 'train_route') {
      const from = origin || args.from;
      const to = destination || args.to;
      if (typeof railwayEngine?.spawnRailRoute === 'function') {
        await railwayEngine.spawnRailRoute(from, to, args);
      } else if (typeof runner === 'function') {
        await runner('rail_route', { ...args, from, to });
      }
      return;
    }

    if (action === 'drive_route' || action === 'start_drive') {
      const from = origin || args.from;
      const to = destination || args.to;
      if (typeof driveEngine?.startRouteDrive === 'function') {
        await driveEngine.startRouteDrive(from, to, args);
      } else if (typeof runner === 'function') {
        await runner('drive_route', { ...args, from, to });
      }
      return;
    }

    if (action === 'follow_traffic' || action === 'traffic_stalker') {
      const targetId = args.targetId || args.id || query;
      if (typeof driveEngine?.latchOntoTraffic === 'function') {
        driveEngine.latchOntoTraffic(targetId, args);
      } else if (typeof runner === 'function') {
        await runner('follow_traffic', { ...args, targetId });
      }
      return;
    }

    if (action === 'stop_drive') {
      if (typeof driveEngine?.stopDrive === 'function') {
        driveEngine.stopDrive();
      }
      return;
    }

    if (action === 'sail' || action === 'boat_route') {
      const from = origin || args.from || args.water || args.boat;
      const to = destination || args.to;
      if (typeof boatEngine?.spawnBoatRoute === 'function') {
        await boatEngine.spawnBoatRoute(from, to, args);
      } else if (typeof runner === 'function') {
        await runner('sail', { ...args, from, to });
      }
      return;
    }

    if (action === 'stop_boat' || action === 'dock_boat') {
      if (typeof boatEngine?.clearActiveBoatRoute === 'function') {
        boatEngine.clearActiveBoatRoute();
      }
      return;
    }

    if (
      action === 'city_life_enable' ||
      action === 'step_into_city' ||
      action === 'city_life'
    ) {
      const city = query || args.city || 'atlanta';
      if (typeof cityEngine?.stepIntoCity === 'function') {
        await cityEngine.stepIntoCity(city, args);
      }
      return;
    }

    if (
      action === 'living_world_enable' ||
      action === 'step_into_locale' ||
      action === 'living_world'
    ) {
      const locale = query || args.locale || 'darien_ga';
      if (typeof cityEngine?.stepIntoLocale === 'function') {
        await cityEngine.stepIntoLocale(locale, args);
      }
      return;
    }

    if (action === 'city_life_disable' || action === 'stop_city_life') {
      if (typeof cityEngine?.clearPedestrians === 'function') {
        cityEngine.clearPedestrians();
      }
      if (typeof cityEngine?.getUrbanEvents === 'function') {
        cityEngine.getUrbanEvents()?.stopUrbanEvent();
      }
      return;
    }

    if (action === 'start_urban_event' || action === 'urban_event') {
      const eventId = query || args.event || args.eventId || 'monaco_gp';
      if (typeof cityEngine?.getUrbanEvents === 'function') {
        cityEngine.getUrbanEvents()?.startUrbanEvent(eventId, args);
      }
      return;
    }

    if (action === 'stop_urban_event') {
      if (typeof cityEngine?.getUrbanEvents === 'function') {
        cityEngine.getUrbanEvents()?.stopUrbanEvent();
      }
      return;
    }

    if (action === 'start_transit_bus' || action === 'transit_bus') {
      const city = query || args.city || 'atlanta';
      if (typeof window !== 'undefined' && window.__gevBusEngine) {
        window.__gevBusEngine.startBusFleet(city, args);
      }
      return;
    }

    if (action === 'start_transit_metro' || action === 'transit_metro') {
      const city = query || args.city || 'chicago';
      if (typeof window !== 'undefined' && window.__gevMetroEngine) {
        window.__gevMetroEngine.startMetroSystem(city, args);
      }
      return;
    }

    if (action === 'stop_transit') {
      if (typeof window !== 'undefined') {
        window.__gevBusEngine?.stopBusFleet();
        window.__gevMetroEngine?.stopMetroSystem();
      }
      return;
    }

    if (action === 'control_cockpit') {
      if (typeof runner === 'function') {
        await runner('control_cockpit', args);
      }
      return;
    }

    if (action === 'connect_places' || action === 'place_relationship') {
      const from = origin || args.from || args.origin;
      const to = destination || args.to || args.destination;
      const drawer =
        corridorDrawer ||
        (typeof getCorridorDrawer === 'function'
          ? getCorridorDrawer()
          : null) ||
        (typeof window !== 'undefined' ? window.__gevCorridorDrawer : null);
      if (from && to && typeof drawer?.connectPlaces === 'function') {
        await drawer.connectPlaces(from, to, args);
      }
      return;
    }

    // Direct invocation via runner for all standard GEV actions
    if (typeof runner === 'function' && action) {
      await runner(action, args);
    }
  }

  function connect() {
    if (isDestroyed) return;
    try {
      eventSource = new EventSourceClass('/api/agent/events');

      eventSource.onmessage = async (event) => {
        if (!event?.data || event.data.startsWith(':')) return;
        try {
          const command = JSON.parse(event.data);
          await handleAgentCommand(command);
        } catch (err) {
          console.warn('[AgentBridge] Failed to parse agent command:', err);
        }
      };

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (!isDestroyed && !retryTimer) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            connect();
          }, 5000);
        }
      };
    } catch (err) {
      console.warn('[AgentBridge] EventSource connection error:', err);
    }
  }

  connect();

  return {
    destroy: () => {
      isDestroyed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (eventSource) {
        try {
          eventSource.close();
        } catch {
          /* best effort */
        }
        eventSource = null;
      }
    },
    dispatchLocal: handleAgentCommand,
  };
}
