var map;

mapboxgl.accessToken = MAPBOX_TOKEN;

var transformRequest = (url, resourceType) => {
  var isMapboxRequest =
    url.slice(8, 22) === "api.mapbox.com" || url.slice(10, 26) === "tiles.mapbox.com";
  return {
    url: isMapboxRequest ? url.replace("?", "?pluginName=sheetMapper&") : url,
  };
};

var filters = document.getElementById("filters");

$(document).ready(function () {
  fetchSheet();
});

function fetchSheet() {
  $.ajax({
    type: "GET",
    url: `https://docs.google.com/spreadsheets/d/${GSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${GSHEET_NAME}`,
    dataType: "text",
    success: function (csvData) {
      if (csvData.length > 0) {
        makeMap(csvData);
        makeCards(csvData);
      } else {
        setTimeout(function () {
          fetchSheet();
        }, 2000);
      }
    },
  });
}

function makeMap(csvData) {
  var clickedStateId = null;

  map = new mapboxgl.Map({
    container: "map", // container id
    style: "mapbox://styles/mapbox/light-v10", // stylesheet location
    center: [parseFloat(CENTER_LON), parseFloat(CENTER_LAT)], // starting position
    zoom: 4, // starting zoom
    transformRequest: transformRequest,
  });

  csv2geojson.csv2geojson(
    csvData,
    {
      latfield: "Lat",
      lonfield: "Lon",
      delimiter: ",",
    },
    function (err, data) {
      map.on("load", function () {
        $("#filters").show();

        data.features.forEach(function(pin) {
          var el = document.createElement('span');
          el.id = pin.properties['ID'];
          switch(pin.properties['Status']) {
            case "No vaccine available":
              el.className = "pin status-no"; el.style.background = "#d7191c"; break;
            case "Have vaccine, no appointments":
              el.className = "pin status-no-appt"; el.style.background = "#fdae61"; break;
            case "Available for eligible":
              el.className = "pin status-available"; el.style.background = "#1a9641"; break;
            default:
              el.className = "pin status-unknown"; el.style.background = "#4a9ecf";
          };

          new mapboxgl.Marker(el)
            .setRotation(-45)
            .setLngLat(pin.geometry.coordinates)
            .addTo(map);
        });

        var bbox = turf.bbox(data);
        map.fitBounds(bbox, { padding: 50 });

        // Tie filter toggles to data
        for (const name of ['available', 'no-appt', 'no', 'unknown']) {
          $(`#status-${name}`).on('change', function() {
            $(`.status-${name}`).toggle();
            updateVisible();
          });
        }

        map.on('moveend', function() { updateVisible(); });

        var geocoder = new MapboxGeocoder({
          accessToken: mapboxgl.accessToken,
          mapboxgl: mapboxgl,
        });
        geocoder.setCountries("us");
        geocoder.setProximity({
          latitude: CENTER_LAT,
          longitude: CENTER_LON,
        });
        map.addControl(geocoder);
      });
    }
  );
}

function makeCards(csvData) {
  var rows = Papa.parse(csvData).data;
  var keys = rows[0];
  data = [];
  for (i = 1; i < rows.length; i++) {
    var entry = {};
    for (j = 0; j < rows[i].length; j++) {
      entry[keys[j]] = rows[i][j];
    }
    data.push(Object.assign({}, entry));
  }

  // TODO: fill data into cards:
  var cardsHtml = data.map((cardData) => {
    return `
<div class="location-card" id="card-${cardData.ID}">
  <header class="card__header">
    <h1 class="card__title">${cardData.Name}</h1>
    <div class="card__addr">
      <span>${cardData.Address} <a target="_blank" href="https://www.google.com/maps/dir//${cardData.Name}, ${cardData.Address}"><i style="font-size:20px" class="material-icons">directions</i></a></span>
    </div>
  </header>
  <div class="card__middle">
    <div>
      <div class="card__last-updated">${cardData["Last Contacted"]}</div>
      <div class="card__pill--success">${cardData["Status"]}</div>
    </div>
    <div>${
      cardData["Website"] &&
      `
            <a target="_blank" href="${cardData["Website"]}" class="card__cta">
        Visit Website <img src="/assets/img/custom/external-link-white.svg"
      /></a>
      `
    }

    </div>
  </div>
  <div class="card__footer">${cardData["Last appointment instructions"]} / ${
      cardData["Last restrictions"]
    } /  ${cardData["Last external notes"]} / ${cardData["Summary"]}</div>
</div>
    `;
  });
  $("#provider-cards").html(cardsHtml);

  $('.location-card').mouseenter(function() {
    const pinId = '#' + $(this).attr('id').replace('card-', '');
    $(pinId).addClass('highlight-pin');
  }).mouseleave(function() {
    const pinId = '#' + $(this).attr('id').replace('card-', '');
    $(pinId).removeClass('highlight-pin');
  });
}

function intersectRect(r1, r2) {
  return !(r2.left > r1.right ||
    r2.right < r1.left ||
    r2.top > r1.bottom ||
    r2.bottom < r1.top);
}

function updateVisible() {
  var cc = map.getContainer();
  var els = cc.getElementsByClassName('pin');
  var ccRect = cc.getBoundingClientRect();
  for (var i=0; i < els.length; i++) {
    var el = els.item(i);
    var elRect = el.getBoundingClientRect();
    if (intersectRect(ccRect, elRect)) {
      $(`#card-${el.id}`).show();
    } else {
      $(`#card-${el.id}`).hide();
    }
  }
}