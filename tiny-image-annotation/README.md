# simple-image-annotation

A simple app to annotation image with lines and polygons.

Static web app, vanilla js and html, no build tools, no backend.

User can select image from computer, draw lines and polygons on top, and export annotations as json.

Annotation include geomtery, and user can also attach json properties. 

```
[
    {
        properties: {..}
        geometry: ..
    },
    ...
]
``