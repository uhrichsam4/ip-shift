# Globe land data

`build_globe.py` loads the first file that exists:

1. `ne_110m_land.geojson`: Natural Earth 1:110m land polygons. Source:
   https://github.com/nvkelso/natural-earth-vector (geojson/ne_110m_land.geojson),
   naturalearthdata.com. Licence: public domain (no attribution required).
   **Not downloaded yet.** Downloading needs the user's explicit approval. Once
   approved, save it here and run `blender/scripts/build_globe.py` again.
2. `land_coarse.geojson` (in use now): coarse continent outlines (29 polygons, about
   10 degree accuracy) written by hand for this project, contributed as public
   domain (CC0). It is a stand-in until the Natural Earth file is approved.
